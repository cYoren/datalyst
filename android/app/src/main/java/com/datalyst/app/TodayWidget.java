package com.datalyst.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Home screen widget: today's check-in progress, what is next, tap to check in. */
public class TodayWidget extends AppWidgetProvider {
    static final String PREFS = "datalyst_widget";

    /** Straight to the check-in list, the reason someone taps the widget. */
    private static final String CHECKIN_URL = "datalyst://dashboard/checkin";
    private static final int WIDE_MIN_WIDTH_DP = 250;

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidget.class));
        for (int id : ids) {
            render(context, manager, id, manager.getAppWidgetOptions(id));
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            render(context, manager, id, manager.getAppWidgetOptions(id));
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id, options);
    }

    private static void render(Context context, AppWidgetManager manager, int id, Bundle options) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String date = prefs.getString("date", "");
        int total = prefs.getInt("total", 0);
        int logged = prefs.getInt("logged", 0);
        String next = prefs.getString("next", "");

        // No date: never synced or signed out. Another day: nothing logged yet, and
        // today's total may differ (weekly schedules), so no count until the app syncs.
        boolean hasData = !date.isEmpty();
        boolean isToday = hasData && today.equals(date);
        boolean done = isToday && total > 0 && logged >= total;

        String status;
        if (!hasData) {
            status = context.getString(R.string.widget_open_app);
        } else if (!isToday) {
            status = context.getString(R.string.widget_not_started);
        } else if (total == 0) {
            status = context.getString(R.string.widget_nothing_today);
        } else if (done) {
            status = context.getString(R.string.widget_done);
        } else if (logged == 0) {
            status = context.getString(R.string.widget_not_started);
        } else {
            status = context.getString(R.string.widget_in_progress);
        }

        // Same wording as iOS: the compact slot spends its one text line on the next step.
        String nextLine = !next.isEmpty() && isToday && !done
            ? context.getString(R.string.widget_next, next)
            : "";
        String hint = nextLine.isEmpty() ? status : nextLine;
        // A tap that could not be written says so until the next sync replaces it.
        if ("failed".equals(prefs.getString(WidgetLogClient.NOTICE_KEY, ""))) {
            hint = context.getString(R.string.widget_log_failed);
        }

        boolean wide = options != null
            && options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) >= WIDE_MIN_WIDTH_DP;
        RemoteViews views = new RemoteViews(context.getPackageName(),
            wide ? R.layout.widget_today_wide : R.layout.widget_today);

        // No fraction to show when there is no account or no schedule: the message carries
        // the widget on its own, and a naked "0" would read like a score.
        boolean showCount = isToday && total > 0;
        if (showCount) {
            views.setViewVisibility(R.id.widget_count, View.VISIBLE);
            views.setTextViewText(R.id.widget_count, logged + "/" + total);
        } else {
            views.setViewVisibility(R.id.widget_count, View.GONE);
        }

        views.setTextViewText(R.id.widget_status, hint);

        if (showCount) {
            views.setViewVisibility(R.id.widget_progress, View.VISIBLE);
            views.setProgressBar(R.id.widget_progress, total, Math.min(logged, total), false);
        } else {
            views.setViewVisibility(R.id.widget_progress, View.GONE);
        }

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(CHECKIN_URL));
        open.setPackage(context.getPackageName());
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // One tap logs the check-in the widget is already showing, without opening the app.
        // Only for today: a stale widget would write yesterday's date, which the API refuses
        // and iOS never offers. Same rule on both platforms.
        boolean canLog = isToday
            && prefs.getBoolean("canLog", false)
            && !prefs.getString("nextId", "").isEmpty()
            && !prefs.getString("token", "").isEmpty()
            && !"failed".equals(prefs.getString(WidgetLogClient.NOTICE_KEY, ""));
        if (canLog) {
            views.setViewVisibility(R.id.widget_log, View.VISIBLE);
            views.setOnClickPendingIntent(R.id.widget_log, PendingIntent.getBroadcast(context, 1,
                new Intent(context, WidgetLogReceiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } else {
            views.setViewVisibility(R.id.widget_log, View.GONE);
        }

        manager.updateAppWidget(id, views);
    }
}
