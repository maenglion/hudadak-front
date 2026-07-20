package app.netlify.app_hudadak.twa

import android.os.Bundle
import app.netlify.app_hudadak.twa.widget.WidgetUpdateWorker
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 위젯 백그라운드 갱신 스케줄 등록 (앱 실행 시 한 번만 등록됨)
        WidgetUpdateWorker.schedule(this)
    }
}
