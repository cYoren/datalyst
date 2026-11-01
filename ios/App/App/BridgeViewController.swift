import Capacitor

/// Registers the plugins that live in the app target instead of an npm package.
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DatalystWidgetPlugin())
    }
}
