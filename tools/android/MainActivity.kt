package de.leidenschaftlicheslernen.woodrooster

import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File
import java.io.FileOutputStream

class MainActivity : TauriActivity() {
  companion object {
    private const val TAG = "WoodRooster"
    private val RESOURCE_FILES = listOf("openings.json", "openings.pack")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // The resources must exist before super.onCreate(). Tauri initializes the
    // Rust runtime during the superclass call and opens openings.pack there.
    extractResourcesIfNeeded()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
