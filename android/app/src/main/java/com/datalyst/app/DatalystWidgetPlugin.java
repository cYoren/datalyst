package com.datalyst.app;

import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives today's check-in progress from the web app and refreshes the home screen widget. */
@CapacitorPlugin(name = "DatalystWidget")
public class DatalystWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String date = call.getString("date", "");
        SharedPreferences.Editor editor = getContext().getSharedPreferences(TodayWidget.PREFS, 0).edit()
            .putString("date", date)
            .putInt("logged", call.getInt("logged", 0))
            .putInt("total", call.getInt("total", 0))
            .putString("next", call.getString("next", ""))
            .putString("nextId", call.getString("nextId", ""))
            .putString("habitId", call.getString("habitId", ""))
            .putBoolean("canLog", Boolean.TRUE.equals(call.getBoolean("canLog", false)));

        String origin = call.getString("origin");
        if (origin != null && origin.startsWith("https://")) editor.putString("origin", origin);

        String token = call.getString("token");
        if (token != null && !token.isEmpty()) editor.putString("token", token);
        // Sign-out keeps nothing: another account must not inherit the key or the ids.
        if (date.isEmpty()) editor.remove("token");
        // A fresh sync is the app saying the day is current, so a stale "couldn't log"
        // notice from an offline tap has to go: otherwise it hides the Log pill, and with
        // the pill hidden the only code that clears the notice can never run again.
        editor.remove(WidgetLogClient.NOTICE_KEY);

        editor.apply();
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }

    /** Lets the web ask once per install instead of reissuing a key on every sync. */
    @PluginMethod
    public void hasToken(PluginCall call) {
        String token = getContext().getSharedPreferences(TodayWidget.PREFS, 0).getString("token", "");
        JSObject result = new JSObject();
        result.put("hasToken", token != null && !token.isEmpty());
        call.resolve(result);
    }
}
