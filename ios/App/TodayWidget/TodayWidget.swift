import SwiftUI
import WidgetKit

/// Today's check-in progress, written by the app through DatalystWidgetPlugin.
struct Progress: TimelineEntry {
    let date: Date
    let logged: Int
    let total: Int
    let state: State
    enum State { case signedOut, stale, today }
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
        if stored.isEmpty { return Progress(date: date, logged: 0, total: 0, state: .signedOut) }
        if stored != Self.dayKey.string(from: date) { return Progress(date: date, logged: 0, total: 0, state: .stale) }
        return Progress(date: date, logged: defaults?.integer(forKey: "logged") ?? 0,
                        total: defaults?.integer(forKey: "total") ?? 0, state: .today)
    }

    func placeholder(in context: Context) -> Progress { Progress(date: Date(), logged: 2, total: 5, state: .today) }

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

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Progress

    var fraction: Double { entry.total == 0 ? 0 : min(1, Double(entry.logged) / Double(entry.total)) }
    var count: String { entry.total > 0 ? "\(entry.logged)/\(entry.total)" : "0" }
    var status: String {
        switch entry.state {
        case .signedOut: return "Open Datalyst to set up your check-in"
        case .stale: return "Not logged yet"
        case .today: if entry.total == 0 { return "Nothing to log today" }
        }
        if entry.logged >= entry.total { return "Done for today" }
        return entry.logged == 0 ? "Not logged yet" : "Keep going"
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Group {
                if entry.state == .today && entry.total > 0 {
                    Gauge(value: fraction) { Text("Today") } currentValueLabel: { Text(count) }
                        .gaugeStyle(.accessoryCircularCapacity)
                } else {
                    // Signed out, stale or nothing scheduled: no number to show.
                    Image(systemName: entry.state == .signedOut ? "person.crop.circle" : entry.state == .stale ? "circle.dashed" : "checkmark.circle")
                        .font(.title)
                }
            }
            .privacySensitive()
            .containerBackground(.clear, for: .widget)
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text(entry.total > 0 ? "Check-in \(count)" : "Check-in").font(.headline)
                Text(status).font(.caption)
            }
            // Lock screen: personal stats stay hidden until the device is unlocked.
            .privacySensitive()
            .containerBackground(.clear, for: .widget)
        default:
            VStack(alignment: .leading, spacing: 6) {
                Text("Today's check-in").font(.caption).foregroundStyle(.white.opacity(0.8))
                if entry.total > 0 {
                    Text("\(entry.logged)/\(entry.total)").font(.system(size: 34, weight: .bold)).foregroundStyle(.white)
                    ProgressView(value: fraction).tint(.white)
                }
                Text(status).font(.footnote).foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .containerBackground(Color(red: 0x5D / 255, green: 0x61 / 255, blue: 0xD5 / 255), for: .widget)
        }
    }
}

@main
struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayWidget", provider: Provider()) { TodayWidgetView(entry: $0) }
            .configurationDisplayName("Today's check-in")
            .description("See how much of today is logged.")
            .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}
