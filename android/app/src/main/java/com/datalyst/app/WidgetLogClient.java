package com.datalyst.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Posts one tapped check-in with the widget's device key. No WebView and no session cookie:
 * the key only allows "yes" for a yes/no variable the widget already showed.
 */
final class WidgetLogClient {
    static final String DEFAULT_ORIGIN = "https://www.datalyst.one";
    /** Set when a tap could not be written; the widget shows it until the next sync. */
    static final String NOTICE_KEY = "notice";

    private WidgetLogClient() {}

    /** Returns true when the stored day was refreshed. */
    static boolean logNext(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(TodayWidget.PREFS, 0);
        String token = prefs.getString("token", "");
        String subvariableId = prefs.getString("nextId", "");
        String habitId = prefs.getString("habitId", "");
        String date = prefs.getString("date", "");
        String origin = prefs.getString("origin", DEFAULT_ORIGIN);
        if (token.isEmpty() || subvariableId.isEmpty() || habitId.isEmpty() || date.isEmpty()) return false;

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(origin + "/api/widget/log").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);

            JSONObject body = new JSONObject()
                .put("habitId", habitId)
                .put("subvariableId", subvariableId)
                .put("date", date);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = connection.getResponseCode();
            if (code == 401) {
                // Revoked or rotated: the app issues a new key on the next sync.
                prefs.edit().remove("token").remove(NOTICE_KEY).apply();
                return false;
            }
            if (code != 200) {
                prefs.edit().putString(NOTICE_KEY, "failed").apply();
                return false;
            }

            JSONObject json = new JSONObject(read(connection));
            SharedPreferences.Editor editor = prefs.edit()
                .putString("date", json.optString("date", date))
                .putInt("logged", json.optInt("logged", 0))
                .putInt("total", json.optInt("total", 0))
                .remove(NOTICE_KEY);

            JSONObject next = json.optJSONObject("next");
            editor.putString("next", next == null ? "" : next.optString("name", ""))
                .putString("nextId", next == null ? "" : next.optString("subvariableId", ""))
                .putString("habitId", next == null ? "" : next.optString("habitId", ""))
                .putBoolean("canLog", next != null && next.optBoolean("canLog", false));
            editor.apply();
            return true;
        } catch (Exception error) {
            prefs.edit().putString(NOTICE_KEY, "failed").apply();
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(HttpURLConnection connection) throws Exception {
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
        }
        return text.toString();
    }
}
