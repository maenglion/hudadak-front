package app.netlify.app_hudadak.twa

import android.os.Bundle
import app.netlify.app_hudadak.twa.widget.WidgetPinPlugin
import app.netlify.app_hudadak.twa.widget.WidgetSyncPlugin
import app.netlify.app_hudadak.twa.widget.WidgetWorkScheduler
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetPinPlugin::class.java)
        registerPlugin(WidgetSyncPlugin::class.java)
        super.onCreate(savedInstanceState)
        WidgetWorkScheduler.ensurePeriodic(this)
    }

    override fun onResume() {
        super.onResume()
        WidgetWorkScheduler.ensurePeriodic(this)
    }
}
