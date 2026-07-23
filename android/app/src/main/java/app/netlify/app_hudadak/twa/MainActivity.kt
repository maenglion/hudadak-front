package app.netlify.app_hudadak.twa

import android.os.Bundle
import app.netlify.app_hudadak.twa.widget.WidgetPinPlugin
import app.netlify.app_hudadak.twa.widget.WidgetSyncPlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetPinPlugin::class.java)
        registerPlugin(WidgetSyncPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
