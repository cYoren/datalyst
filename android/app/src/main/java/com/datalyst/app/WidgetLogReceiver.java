package com.datalyst.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Runs the network call for a widget tap. The launcher only allows a short broadcast, so the
 * work is handed to `goAsync` and a background thread, and the widget is re-rendered after.
 */
public class WidgetLogReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                // Re-render either way: success shows the new day, failure shows the notice
                // or the cleared key.
                WidgetLogClient.logNext(app);
                TodayWidget.refreshAll(app);
            } finally {
                pending.finish();
            }
        }).start();
    }
}
