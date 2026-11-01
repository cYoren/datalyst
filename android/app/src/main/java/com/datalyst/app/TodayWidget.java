package com.datalyst.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Home screen widget: today's check-in progress, tap to open the app. */
public class TodayWidget extends AppWidgetProvider {
    static final String PREFS = "datalyst_widget";

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class));
        new TodayWidget().onUpdate(context, manager, ids);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String date = prefs.getString("date", "");
        int total = prefs.getInt("total", 0);
        int logged = prefs.getInt("logged", 0);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        // No date: never synced or signed out. Another day: nothing logged yet, and
        // today's total may differ (weekly schedules), so no count until the app syncs.
        int message = date.isEmpty() ? R.string.widget_open_app
            : !today.equals(date) ? R.string.widget_not_started
            : total == 0 ? R.string.widget_nothing_today : 0;
        if (message != 0) {
            views.setTextViewText(R.id.widget_count, "");
            views.setViewVisibility(R.id.widget_progress, View.GONE);
            views.setTextViewText(R.id.widget_status, context.getString(message));
        } else {
            views.setTextViewText(R.id.widget_count, logged + "/" + total);
            views.setViewVisibility(R.id.widget_progress, View.VISIBLE);
            views.setProgressBar(R.id.widget_progress, total, Math.min(logged, total), false);
            views.setTextViewText(R.id.widget_status, context.getString(
                logged >= total ? R.string.widget_done : logged == 0 ? R.string.widget_not_started : R.string.widget_in_progress));
        }

        Intent open = new Intent(context, MainActivity.class);
        views.setOnClickPendingIntent(R.id.widget_root,
            PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        for (int id : ids) manager.updateAppWidget(id, views);
    }
}
