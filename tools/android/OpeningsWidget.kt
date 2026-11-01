package de.leidenschaftlicheslernen.woodrooster

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import java.io.File

/**
 * Widget fuer den Startbildschirm: oben "Alle faelligen" quer durch alle
 * Eroeffnungen, darunter die gemerkten Puzzle und jede aktivierte Eroeffnung
 * mit "faellig" und "neu", wie die Kacheln auf der Startseite. Antippen
 * startet sofort die Sitzung.
 *
 * Die Zahlen kommen direkt aus der SQLite-Datei der App, nur lesend. Die
 * Rust-Seite laeuft hier nicht - das Widget muss auch funktionieren, wenn die
 * App gar nicht offen ist, und faellige Karten werden mit der Zeit mehr.
 */
class OpeningsWidget : AppWidgetProvider() {
  companion object {
    private const val TAG = "WoodRooster"

    /** Slug der Eroeffnung, die MainActivity sofort ueben soll. */
    const val EXTRA_SLUG = "de.leidenschaftlicheslernen.woodrooster.WIDGET_SLUG"
    const val ACTION_PRACTICE = "de.leidenschaftlicheslernen.woodrooster.PRACTICE"
    private const val ACTION_REFRESH = "de.leidenschaftlicheslernen.woodrooster.WIDGET_REFRESH"

    /** Muss zu FAVORITES in commands.rs passen. */
    const val FAVORITES = "@favorites"

    /** Alle fälligen quer durch die Eroeffnungen; muss zu DUE in commands.rs passen. */
    const val DUE = "@due"

    /** Nach dem Ueben die Zahlen neu einlesen; billig, wenn kein Widget liegt. */
    fun refresh(context: Context) {
      try {
        val manager = AppWidgetManager.getInstance(context) ?: return
        val ids = manager.getAppWidgetIds(ComponentName(context, OpeningsWidget::class.java))
        @Suppress("DEPRECATION")
        if (ids.isNotEmpty()) manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
      } catch (e: Exception) {
        Log.w(TAG, "Widget refresh failed", e)
      }
    }

    /**
     * Frischt das Widget auf, sobald die naechste Karte faellig wird - sonst
     * stuende "0 faellig" bis zum naechsten 30-Minuten-Takt da, obwohl eine
     * Nochmal-Karte laengst wieder dran ist. Ungenau und ohne Aufwecken: das
     * kostet keinen Akku, und bei dunklem Bildschirm sieht es ohnehin keiner.
     */
    fun scheduleNext(context: Context, at: Long?) {
      try {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val pending = PendingIntent.getBroadcast(
          context,
          2,
          Intent(context, OpeningsWidget::class.java).setAction(ACTION_REFRESH),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        if (at == null) alarms.cancel(pending) else alarms.set(AlarmManager.RTC, at + 1000, pending)
      } catch (e: Exception) {
        Log.w(TAG, "Could not schedule widget refresh", e)
      }
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_REFRESH) refresh(context) else super.onReceive(context, intent)
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, build(context, id))
    // Der regelmaessige Aufruf (updatePeriodMillis) soll auch die Liste
    // auffrischen, sonst bliebe "faellig" auf dem Stand des Platzierens.
    @Suppress("DEPRECATION")
    manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
  }

  private fun build(context: Context, id: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_openings)

    val adapter = Intent(context, OpeningsWidgetService::class.java).apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
      // Sonst haelt Android alle Widgets fuer denselben Adapter.
      data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
    }
    @Suppress("DEPRECATION")
    views.setRemoteAdapter(R.id.widget_list, adapter)
    views.setEmptyView(R.id.widget_list, R.id.widget_empty)

    val open = PendingIntent.getActivity(
      context,
      0,
      Intent(context, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    views.setOnClickPendingIntent(R.id.widget_header, open)
    views.setOnClickPendingIntent(R.id.widget_empty, open)

    // Vorlage fuer die Zeilen; jede Zeile ergaenzt nur ihren Slug. Muss
    // veraenderbar sein, damit Android das Extra einfuegen darf.
    val practice = Intent(context, MainActivity::class.java).apply {
      action = ACTION_PRACTICE
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val template = PendingIntent.getActivity(
      context,
      1,
      practice,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
    views.setPendingIntentTemplate(R.id.widget_list, template)
    return views
  }
}

class OpeningsWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = OpeningsFactory(applicationContext)
}

/** Eine Zeile im Widget. */
data class WidgetRow(val slug: String, val name: String, val due: Long, val fresh: Long)

/** Die Zeilen und wann die naechste Karte faellig wird (null: keine). */
data class WidgetSnapshot(val rows: List<WidgetRow>, val nextDue: Long?)

private class OpeningsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var rows: List<WidgetRow> = emptyList()

  override fun onCreate() {}

  override fun onDestroy() {}

  // Laeuft auf einem Binder-Thread, Datenbankzugriff ist hier erlaubt.
  override fun onDataSetChanged() {
    val snapshot = WidgetData.load(context)
    rows = snapshot.rows
    OpeningsWidget.scheduleNext(context, snapshot.nextDue)
  }

  override fun getCount(): Int = rows.size

  override fun getViewAt(position: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_openings_item)
    val row = rows.getOrNull(position) ?: return views
    val fav = row.slug == OpeningsWidget.FAVORITES
    val due = row.slug == OpeningsWidget.DUE
    views.setTextViewText(R.id.item_name, if (fav) "♥ ${row.name}" else row.name)
    // Farbiger Streifen links: rosa fuer gemerkte, blau fuer alle faelligen.
    views.setViewVisibility(R.id.item_fav_bar, if (fav || due) View.VISIBLE else View.GONE)
    if (fav || due) {
      views.setImageViewResource(
        R.id.item_fav_bar,
        if (due) R.drawable.widget_due_bar else R.drawable.widget_fav_bar,
      )
    }

    show(views, R.id.item_due, row.due, "fällig", always = due)
    views.setTextColor(
      R.id.item_due,
      context.getColor(if (row.due > 0) R.color.widget_due else R.color.widget_muted),
    )
    show(views, R.id.item_new, row.fresh, "neu")
    // "Alle faelligen" zeigt immer seine Zahl, auch "0 faellig".
    views.setViewVisibility(
      R.id.item_done,
      if (!due && row.due == 0L && row.fresh == 0L) View.VISIBLE else View.GONE,
    )

    views.setOnClickFillInIntent(
      R.id.widget_item,
      Intent().putExtra(OpeningsWidget.EXTRA_SLUG, row.slug),
    )
    return views
  }

  private fun show(views: RemoteViews, id: Int, n: Long, label: String, always: Boolean = false) {
    if (n > 0 || always) {
      views.setTextViewText(id, "${"%,d".format(java.util.Locale.GERMANY, n)} $label")
      views.setViewVisibility(id, View.VISIBLE)
    } else {
      views.setViewVisibility(id, View.GONE)
    }
  }

  override fun getLoadingView(): RemoteViews? = null

  override fun getViewTypeCount(): Int = 1

  override fun getItemId(position: Int): Long = rows.getOrNull(position)?.slug?.hashCode()?.toLong() ?: position.toLong()

  override fun hasStableIds(): Boolean = true
}

/**
 * Liest dieselben Zahlen wie list_activated und favorites_summary in
 * commands.rs. Wer dort etwas aendert, muss es hier nachziehen.
 */
object WidgetData {
  private const val TAG = "WoodRooster"

  /** Tauris app_data_dir ist auf Android `applicationInfo.dataDir`, siehe lib.rs. */
  fun dbFile(context: Context): File = File(context.applicationInfo.dataDir, "woodrooster.sqlite")

  fun load(context: Context): WidgetSnapshot {
    val empty = WidgetSnapshot(emptyList(), null)
    val file = dbFile(context)
    if (!file.exists()) return empty
    val now = System.currentTimeMillis()
    return try {
      // Nur lesend: Android legt bei Schreibverbindungen sonst eine eigene
      // Tabelle an und stellt den Journalmodus um - beides gehoert der App.
      SQLiteDatabase.openDatabase(
        file.path,
        null,
        SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,
      ).use { db ->
        val out = mutableListOf<WidgetRow>()
        // Wie DUE in commands.rs: aktive Eroeffnungen und gemerkte Puzzle,
        // nicht die liegengebliebenen Karten entfernter Eroeffnungen.
        val inScope = """(p.id IN (SELECT puzzle_id FROM favorite)
                          OR EXISTS (SELECT 1 FROM opening o
                                      WHERE o.slug = p.variation OR o.slug = p.family))"""
        var nextDue: Long? = null
        var allDue = 0L
        db.rawQuery(
          """SELECT SUM(c.due <= $now), MIN(CASE WHEN c.due > $now THEN c.due END)
               FROM puzzle p JOIN card c ON c.puzzle_id = p.id
              WHERE $inScope""",
          null,
        ).use { c ->
          if (c.moveToFirst()) {
            allDue = if (c.isNull(0)) 0L else c.getLong(0)
            nextDue = if (c.isNull(1)) null else c.getLong(1)
          }
        }
        db.rawQuery(
          """SELECT
               (SELECT COUNT(*) FROM favorite),
               (SELECT COUNT(*) FROM favorite f LEFT JOIN card c ON c.puzzle_id = f.puzzle_id
                 WHERE c.puzzle_id IS NULL),
               (SELECT COUNT(*) FROM favorite f JOIN card c ON c.puzzle_id = f.puzzle_id
                 WHERE c.due <= $now)""",
          null,
        ).use { c ->
          if (c.moveToFirst() && c.getLong(0) > 0) {
            out += WidgetRow(OpeningsWidget.FAVORITES, "Gemerkte Puzzle", c.getLong(2), c.getLong(1))
          }
        }
        db.rawQuery(
          """SELECT o.slug, o.display_name,
                    (SELECT COUNT(*) FROM puzzle p
                      LEFT JOIN card c ON c.puzzle_id = p.id
                      WHERE (p.variation = o.slug OR p.family = o.slug)
                        AND c.puzzle_id IS NULL),
                    (SELECT COUNT(*) FROM puzzle p
                      JOIN card c ON c.puzzle_id = p.id
                      WHERE (p.variation = o.slug OR p.family = o.slug)
                        AND c.due <= $now)
               FROM opening o
              ORDER BY o.added_at""",
          null,
        ).use { c ->
          while (c.moveToNext()) {
            out += WidgetRow(c.getString(0), c.getString(1), c.getLong(3), c.getLong(2))
          }
        }
        // Ganz oben, sobald es ueberhaupt etwas zu ueben gibt.
        if (out.isNotEmpty()) out.add(0, WidgetRow(OpeningsWidget.DUE, "Alle fälligen", allDue, 0))
        WidgetSnapshot(out, nextDue)
      }
    } catch (e: Exception) {
      // Etwa waehrend die App das Schema anlegt; beim naechsten Mal klappt es.
      Log.w(TAG, "Widget could not read ${file.path}", e)
      empty
    }
  }
}
