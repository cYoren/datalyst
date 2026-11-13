import AppIntents
import SwiftUI
import WidgetKit

/// App palette (`src/app/globals.css`). One tint for state, muted text from the
/// same neutral ramp, no colour that is not carrying meaning.
private enum Palette {
    static let surface = Color(red: 0x1A / 255, green: 0x1B / 255, blue: 0x20 / 255)
    static let ink = Color(red: 0xF2 / 255, green: 0xF1 / 255, blue: 0xEE / 255)
    static let mute = Color(red: 0xAA / 255, green: 0xA9 / 255, blue: 0xA6 / 255)
    static let accent = Color(red: 0x9D / 255, green: 0x9F / 255, blue: 0xFF / 255)
    static let done = Color(red: 0x5E / 255, green: 0xD3 / 255, blue: 0xB5 / 255)
}

/// Straight to the check-in list, the reason someone taps the widget.
private let checkinURL = URL(string: "datalyst://dashboard/checkin")

/// Today's check-in progress, written by the app through DatalystWidgetPlugin.
struct Progress: TimelineEntry {
    let date: Date
    let logged: Int
    let total: Int
    let next: String
    let canLog: Bool
    /// A tap that could not be written. Android shows the same state; without it a failed
    /// tap looks exactly like a successful one, forever.
    let failed: Bool
    let state: State
    enum State { case signedOut, stale, today }
}

extension Progress {
    var count: String { total > 0 ? "\(logged)/\(total)" : "0" }
    var fraction: Double { total == 0 ? 0 : min(1, Double(logged) / Double(total)) }
    var hasBar: Bool { state == .today && total > 0 }
    var isDone: Bool { hasBar && logged >= total }

    /// One sentence, same wording on both platforms.
    var status: String {
        switch state {
        case .signedOut: return "Open Datalyst to set up your check-in"
        case .stale: return "Not logged yet"
        case .today:
            if failed { return "Couldn't log, tap to open" }
            if total == 0 { return "Nothing to log today" }
            if logged >= total { return "Done for today" }
            return logged == 0 ? "Not logged yet" : "Keep going"
        }
    }

    /// Compact slots spend their one text line on the next step; same rule as Android.
    var hint: String {
        guard state == .today, !isDone, !next.isEmpty, !failed else { return status }
        return "Next: \(next)"
    }

    var inline: String {
        switch state {
        case .signedOut: return "Open Datalyst to check in"
        case .stale: return "Check-in not started"
        case .today:
            if total == 0 { return "Nothing to log today" }
            return logged >= total ? "Check-in done" : "Check-in \(count)"
        }
    }
}

struct Provider: TimelineProvider {
    static let dayKey: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    func read(at date: Date) -> Progress {
        let defaults = UserDefaults(suiteName: "group.com.datalyst.app")
        let stored = defaults?.string(forKey: "date") ?? ""
        // No date: never synced or signed out. Another day: nothing logged yet, and
        // that day's total may differ (weekly schedules), so no count until the app syncs.
        if stored.isEmpty { return Progress(date: date, logged: 0, total: 0, next: "", canLog: false, failed: false, state: .signedOut) }
        if stored != Self.dayKey.string(from: date) { return Progress(date: date, logged: 0, total: 0, next: "", canLog: false, failed: false, state: .stale) }
        let failed = defaults?.string(forKey: "notice") == "failed"
        // Same predicate as Android: a key, an id to log, and no pending failure. Without
        // the id check the button renders and the intent then returns at its guard.
        let canLog = (defaults?.bool(forKey: "canLog") ?? false)
            && !(defaults?.string(forKey: "token") ?? "").isEmpty
            && !(defaults?.string(forKey: "nextId") ?? "").isEmpty
            && !failed
        return Progress(date: date, logged: defaults?.integer(forKey: "logged") ?? 0,
                        total: defaults?.integer(forKey: "total") ?? 0,
                        next: defaults?.string(forKey: "next") ?? "",
                        canLog: canLog,
                        failed: failed,
                        state: .today)
    }

    func placeholder(in context: Context) -> Progress {
        Progress(date: Date(), logged: 2, total: 5, next: "Sleep quality", canLog: true, failed: false, state: .today)
    }

    func getSnapshot(in context: Context, completion: @escaping (Progress) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : read(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Progress>) -> Void) {
        let now = Date()
        let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: now))!
        // A second entry at midnight resets the count without the app running.
        completion(Timeline(entries: [read(at: now), read(at: midnight)], policy: .after(midnight)))
    }
}

/// One tap from the widget: writes "yes" for the yes/no check-in the widget is already
/// showing. Uses the device key the app left in the App Group, and never opens the app.
struct LogNextCheckInIntent: AppIntent {
    static var title: LocalizedStringResource { "Log check-in" }
    static var openAppWhenRun: Bool { false }

    func perform() async throws -> some IntentResult {
        guard let defaults = UserDefaults(suiteName: "group.com.datalyst.app"),
              let token = defaults.string(forKey: "token"), !token.isEmpty,
              let subvariableId = defaults.string(forKey: "nextId"), !subvariableId.isEmpty,
              let habitId = defaults.string(forKey: "habitId"), !habitId.isEmpty,
              let date = defaults.string(forKey: "date"), !date.isEmpty else { return .result() }

        let origin = defaults.string(forKey: "origin") ?? "https://www.datalyst.one"
        guard let url = URL(string: "\(origin)/api/widget/log") else { return .result() }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "habitId": habitId, "subvariableId": subvariableId, "date": date,
        ])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                defaults.set("failed", forKey: "notice")
                return .result()
            }
            if http.statusCode == 401 {
                // Revoked or rotated: the app issues a new key on the next sync.
                defaults.removeObject(forKey: "token")
                defaults.removeObject(forKey: "notice")
            } else if http.statusCode == 200,
                      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let next = json["next"] as? [String: Any]
                defaults.set(json["date"] as? String ?? date, forKey: "date")
                defaults.set(json["logged"] as? Int ?? 0, forKey: "logged")
                defaults.set(json["total"] as? Int ?? 0, forKey: "total")
                defaults.set(next?["name"] as? String ?? "", forKey: "next")
                defaults.set(next?["subvariableId"] as? String ?? "", forKey: "nextId")
                defaults.set(next?["habitId"] as? String ?? "", forKey: "habitId")
                defaults.set(next?["canLog"] as? Bool ?? false, forKey: "canLog")
                defaults.removeObject(forKey: "notice")
            } else {
                // Same sticky notice as Android, cleared by the app's next sync.
                defaults.set("failed", forKey: "notice")
            }
        } catch {
            defaults.set("failed", forKey: "notice")
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// Thin capacity bar. Drawn rather than system-exposed so the track, radius and
/// height match the app instead of a platform default.
private struct CapacityBar: View {
    let fraction: Double
    let tint: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.ink.opacity(0.14))
                Capsule()
                    .fill(tint)
                    .frame(width: max(fraction > 0 ? 6 : 0, proxy.size.width * fraction))
            }
        }
        .frame(height: 5)
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Progress

    private var isAccessory: Bool {
        family == .accessoryInline || family == .accessoryCircular || family == .accessoryRectangular
    }

    private var barTint: Color { entry.isDone ? Palette.done : Palette.accent }

    var body: some View {
        content
            .widgetURL(checkinURL)
            .containerBackground(for: .widget) {
                isAccessory ? Color.clear : Palette.surface
            }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryInline: inline
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        default: card
        }
    }

    /// Both home screen slots share one composition and differ only in the room they get:
    /// the text sits centred, the capacity bar closes the base.
    private var card: some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            HStack(alignment: .center, spacing: 8) {
                if entry.hasBar {
                    Text(entry.count)
                        .font(.largeTitle.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.ink)
                        .widgetAccentable()
                }
                Spacer(minLength: 4)
                if entry.canLog {
                    Button(intent: LogNextCheckInIntent()) {
                        Text("Log")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Palette.surface)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.accent)
                }
            }
            Text(entry.hint)
                .font(.footnote)
                .foregroundStyle(Palette.mute)
                .lineLimit(2)
            Spacer(minLength: 0)
            if entry.hasBar {
                CapacityBar(fraction: entry.fraction, tint: barTint)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.total > 0 ? "Check-in \(entry.count)" : "Check-in").font(.headline)
            Text(entry.hint).font(.caption)
        }
        // Lock screen: personal stats stay hidden until the device is unlocked.
        .privacySensitive()
    }

    private var circular: some View {
        Group {
            if entry.hasBar {
                Gauge(value: entry.fraction) {
                    Text("Today")
                } currentValueLabel: {
                    Text(entry.count).monospacedDigit()
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else {
                // Signed out, stale or nothing scheduled: no number to show.
                Image(systemName: entry.state == .signedOut ? "person.crop.circle" : "circle.dashed")
                    .font(.title)
            }
        }
        .privacySensitive()
    }

    private var inline: some View {
        Text(entry.inline).privacySensitive()
    }
}

@main
struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayWidget", provider: Provider()) { TodayWidgetView(entry: $0) }
            .configurationDisplayName("Today's check-in")
            .description("How much of today is logged, and what is next.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
