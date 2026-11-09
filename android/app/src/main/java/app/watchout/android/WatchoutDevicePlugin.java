package app.watchout.android;
import android.Manifest;
import android.content.Intent;
import android.content.Context;
import android.os.Build;
import android.security.keystore.*;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
@CapacitorPlugin(name="WatchoutDevice",permissions={
    @Permission(alias="location",strings={Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION}),
    @Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public class WatchoutDevicePlugin extends Plugin {
    private static final String ALIAS="watchout_session_v1";
    private javax.crypto.SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(!ks.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
        return (javax.crypto.SecretKey)ks.getKey(ALIAS,null);
    }
    @PluginMethod public void setSession(PluginCall call) {
        try {String value=call.getString("value","");android.content.SharedPreferences p=getContext().getSharedPreferences("secure-session",Context.MODE_PRIVATE);
            if(value.isEmpty()){p.edit().clear().commit();call.resolve();return;}
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());String encoded=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);p.edit().putString("encrypted",encoded).commit();call.resolve();
        }catch(Exception e){call.reject("Secure session storage failed");}
    }
    @PluginMethod public void getSession(PluginCall call) {
        try{String stored=getContext().getSharedPreferences("secure-session",Context.MODE_PRIVATE).getString("encrypted","");JSObject result=new JSObject();if(stored.isEmpty()){result.put("value","");call.resolve(result);return;}
            String[] parts=stored.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));result.put("value",new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8));call.resolve(result);
        }catch(Exception e){call.reject("Could not unlock session. Please sign in again.");}
    }
    @PluginMethod public void startDrive(PluginCall call) {
        if(!"granted".equals(getPermissionState("location").toString())){requestPermissionForAlias("location",call,"locationPermission");return;}
        if(Build.VERSION.SDK_INT>=33&&!"granted".equals(getPermissionState("notifications").toString())){requestPermissionForAlias("notifications",call,"notificationPermission");return;}
        begin(call);
    }
    @PermissionCallback private void locationPermission(PluginCall call){
        if(androidx.core.content.ContextCompat.checkSelfPermission(getContext(),Manifest.permission.ACCESS_FINE_LOCATION)!=android.content.pm.PackageManager.PERMISSION_GRANTED){call.reject("Precise location permission is required for drive recording. Browse the map without granting it.");return;}
        if(Build.VERSION.SDK_INT>=33)requestPermissionForAlias("notifications",call,"notificationPermission");else begin(call);
    }
    @PermissionCallback private void notificationPermission(PluginCall call){begin(call);}
    private void begin(PluginCall call){String drive=call.getString("driveId","");if(!drive.matches("[a-f0-9-]{36}")){call.reject("Invalid drive ID");return;}try{Intent intent=new Intent(getContext(),DriveService.class).putExtra("driveId",drive);if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);else getContext().startService(intent);call.resolve();}catch(Exception e){call.reject("Could not start recording. Open the app and check location permissions.");}}
    @PluginMethod public void stopDrive(PluginCall call){getActivity().runOnUiThread(()->{if(DriveService.instance!=null)DriveService.instance.stopCapture();getContext().stopService(new Intent(getContext(),DriveService.class));getContext().getSharedPreferences("recorder",Context.MODE_PRIVATE).edit().putBoolean("active",false).commit();call.resolve();});}
    @PluginMethod public void driveState(PluginCall call){android.content.SharedPreferences p=getContext().getSharedPreferences("recorder",Context.MODE_PRIVATE);String drive=p.getString("driveId","");JSObject result=new JSObject();result.put("active",DriveService.recording);result.put("driveId",drive);try(DriveStore store=new DriveStore(getContext())){result.put("samples",store.samples(drive));}call.resolve(result);}
    @PluginMethod public void acknowledge(PluginCall call){String drive=call.getString("driveId","");try(DriveStore store=new DriveStore(getContext())){store.acknowledge(drive,call.getInt("sequence",-1));}call.resolve();}
}
