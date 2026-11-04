package com.avfit.app

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.TextView

/** Explains the limited fitness data AVFIT reads/writes from Health Connect. */
class HealthConnectRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val message = TextView(this).apply {
      text = "AVFIT uses Health Connect to read your daily steps, walking distance, and active calories, and to share workouts you save in AVFIT. You control each permission and can revoke access at any time in Health Connect settings."
      textSize = 18f
      setTextColor(Color.rgb(28, 43, 37))
      gravity = Gravity.CENTER
      setPadding(36, 48, 36, 48)
    }
    setContentView(message)
  }
}
