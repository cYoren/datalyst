package com.datalyst.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives today's check-in progress from the web app and refreshes the home screen widget. */
@CapacitorPlugin(name = "DatalystWidget")
public class DatalystWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        getContext().getSharedPreferences(TodayWidget.PREFS, 0).edit()
            .putString("date", call.getString("date", ""))
            .putInt("logged", call.getInt("logged", 0))
            .putInt("total", call.getInt("total", 0))
            .apply();
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }
}
