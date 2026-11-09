package app.watchout.android;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(WatchoutDevicePlugin.class);
        super.onCreate(state);
    }
}
