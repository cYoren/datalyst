import Capacitor
import WidgetKit

/// Receives today's check-in progress from the web app and refreshes the home screen widget.
@objc(DatalystWidgetPlugin)
public class DatalystWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DatalystWidgetPlugin"
    public let jsName = "DatalystWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        let defaults = UserDefaults(suiteName: "group.com.datalyst.app")
        defaults?.set(call.getString("date") ?? "", forKey: "date")
        defaults?.set(call.getInt("logged") ?? 0, forKey: "logged")
        defaults?.set(call.getInt("total") ?? 0, forKey: "total")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
