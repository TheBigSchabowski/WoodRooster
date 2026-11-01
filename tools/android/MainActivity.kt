package de.leidenschaftlicheslernen.woodrooster

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import java.io.File
import java.io.FileOutputStream

class MainActivity : TauriActivity() {
  companion object {
    private const val TAG = "WoodRooster"
    private val RESOURCE_FILES = listOf("openings.json", "openings.pack")

    /** Muss zu WIDGET_START in commands.rs passen. */
    private const val WIDGET_START = "widget-start"
  }

  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    // The resources must exist before super.onCreate(). Tauri initializes the
    // Rust runtime during the superclass call and opens openings.pack there.
    extractResourcesIfNeeded()
    // A recreated activity (or one reopened from recents) carries the old
    // widget intent again; only a fresh tap may start a session.
    if (savedInstanceState == null) takeWidgetIntent(intent)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
  }

  // The app is already running: singleTask delivers the widget tap here.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (takeWidgetIntent(intent)) {
      // The frontend also checks on startup and when it becomes visible; the
      // event just makes the switch immediate.
      webView?.evaluateJavascript("window.dispatchEvent(new Event('woodrooster-widget'))", null)
    }
  }

  // Leaving the app is the moment the counts on the home screen are stale.
  override fun onPause() {
    super.onPause()
    OpeningsWidget.refresh(this)
  }

  /**
   * A tap on an opening in the home screen widget. The slug goes into a file
   * that the frontend picks up via `take_widget_start`; Rust deletes it, so it
   * starts exactly one session.
   */
  private fun takeWidgetIntent(intent: Intent?): Boolean {
    if (intent == null) return false
    if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return false
    val slug = intent.getStringExtra(OpeningsWidget.EXTRA_SLUG) ?: return false
    intent.removeExtra(OpeningsWidget.EXTRA_SLUG)
    return try {
      File(applicationInfo.dataDir, WIDGET_START).writeText(slug)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Could not hand the widget tap to the app", e)
      false
    }
  }

  private fun extractResourcesIfNeeded() {
    try {
      val resourcesDir = File(filesDir, "resources")
      if (!resourcesDir.exists() && !resourcesDir.mkdirs()) {
        error("Could not create ${resourcesDir.absolutePath}")
      }

      val versionMarker = File(resourcesDir, ".version")
      val currentVersion = BuildConfig.VERSION_CODE.toString()
      val versionMatches = versionMarker.exists() &&
        versionMarker.readText().trim() == currentVersion
      val filesExist = RESOURCE_FILES.all { fileName ->
        val file = File(resourcesDir, fileName)
        file.exists() && file.length() > 0L
      }

      if (versionMatches && filesExist) {
        Log.i(TAG, "Resources already extracted for version $currentVersion")
        return
      }

      Log.i(TAG, "Extracting bundled resources to ${resourcesDir.absolutePath}...")
      for (fileName in RESOURCE_FILES) {
        extractResource(fileName, resourcesDir)
      }
      versionMarker.writeText(currentVersion)
      Log.i(TAG, "Resource extraction completed")
    } catch (e: Exception) {
      Log.e(TAG, "Could not extract bundled resources", e)
      throw IllegalStateException("WoodRooster resources are missing", e)
    }
  }

  private fun extractResource(fileName: String, resourcesDir: File) {
    val targetFile = File(resourcesDir, fileName)
    val assetPath = findAssetPath(fileName)
      ?: error("Asset not found in APK: $fileName")
    val tempFile = File(resourcesDir, "$fileName.tmp")

    try {
      Log.i(TAG, "Extracting $assetPath to ${targetFile.absolutePath}...")
      assets.open(assetPath).use { input ->
        FileOutputStream(tempFile).use { output ->
          input.copyTo(output, bufferSize = 64 * 1024)
          output.flush()
        }
      }

      if (tempFile.length() == 0L) {
        error("Extracted asset is empty: $fileName")
      }
      if (targetFile.exists() && !targetFile.delete()) {
        error("Could not replace existing file: ${targetFile.absolutePath}")
      }
      if (!tempFile.renameTo(targetFile)) {
        error("Could not move extracted file to ${targetFile.absolutePath}")
      }

      Log.i(TAG, "Extracted $fileName (${targetFile.length()} bytes)")
    } catch (e: Exception) {
      if (tempFile.exists()) {
        tempFile.delete()
      }
      throw e
    }
  }

  private fun findAssetPath(fileName: String): String? {
    val candidates = listOf("resources/$fileName", fileName)
    return candidates.firstOrNull { path ->
      try {
        assets.open(path).close()
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
