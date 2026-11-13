import Capacitor
import WidgetKit

/// Receives today's check-in progress from the web app and refreshes the home screen widget.
@objc(DatalystWidgetPlugin)
public class DatalystWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DatalystWidgetPlugin"
    public let jsName = "DatalystWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasToken", returnType: CAPPluginReturnPromise)
    ]

    private var defaults: UserDefaults? { UserDefaults(suiteName: "group.com.datalyst.app") }

    @objc func update(_ call: CAPPluginCall) {
        let date = call.getString("date") ?? ""
        defaults?.set(date, forKey: "date")
        defaults?.set(call.getInt("logged") ?? 0, forKey: "logged")
        defaults?.set(call.getInt("total") ?? 0, forKey: "total")
        defaults?.set(call.getString("next") ?? "", forKey: "next")
        defaults?.set(call.getString("nextId") ?? "", forKey: "nextId")
        defaults?.set(call.getString("habitId") ?? "", forKey: "habitId")
        defaults?.set(call.getBool("canLog") ?? false, forKey: "canLog")

        if let origin = call.getString("origin"), origin.hasPrefix("https://") {
            defaults?.set(origin, forKey: "origin")
        }
        if let token = call.getString("token"), !token.isEmpty {
            defaults?.set(token, forKey: "token")
        }
        // Sign-out keeps nothing: another account must not inherit the key or the ids.
        if date.isEmpty {
            defaults?.removeObject(forKey: "token")
        }
        // A fresh sync is the app saying the day is current, so a stale "couldn't log"
        // notice from an offline tap has to go: otherwise it hides the Log button, and with
        // the button hidden the only code that clears the notice can never run again.
        defaults?.removeObject(forKey: "notice")

        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Lets the web ask once per install instead of reissuing a key on every sync.
    @objc func hasToken(_ call: CAPPluginCall) {
        let token = defaults?.string(forKey: "token") ?? ""
        call.resolve(["hasToken": !token.isEmpty])
    }
}
