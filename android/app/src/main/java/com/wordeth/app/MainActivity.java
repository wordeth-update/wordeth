package com.wordeth.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.wordeth.app.screencapture.ScreenCapturePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
