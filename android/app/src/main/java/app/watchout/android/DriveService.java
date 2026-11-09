package app.watchout.android;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
public class DriveService extends Service implements LocationListener {
    public static volatile boolean recording = false;
    public static volatile DriveService instance;
    private LocationManager locations;
    private DriveStore store;
    private String drive;
    private int sequence;
    private android.content.SharedPreferences prefs;
    @Override public void onCreate() { super.onCreate();instance=this;prefs=getSharedPreferences("recorder",MODE_PRIVATE);store=new DriveStore(this);locations=(LocationManager)getSystemService(LOCATION_SERVICE); }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(intent!=null&&"STOP".equals(intent.getAction())) {stopSelf();return START_NOT_STICKY;}
        drive=intent!=null?intent.getStringExtra("driveId"):prefs.getString("driveId","");
        if(drive==null||drive.isEmpty()||ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {stopSelf();return START_NOT_STICKY;}
        recording=true;
        sequence=prefs.getString("driveId","").equals(drive)?prefs.getInt("sequence",0):0;
        prefs.edit().putString("driveId",drive).putInt("sequence",sequence).putBoolean("active",true).commit();
        if(Build.VERSION.SDK_INT>=26) {NotificationChannel channel=new NotificationChannel("private_drive","Private drive recording",NotificationManager.IMPORTANCE_LOW);channel.setDescription("Location is recorded privately while a drive is active.");getSystemService(NotificationManager.class).createNotificationChannel(channel);}
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent content=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Intent stop=new Intent(this,DriveService.class).setAction("STOP");
        PendingIntent stopAction=PendingIntent.getService(this,1,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new NotificationCompat.Builder(this,"private_drive").setContentTitle("Watchout · Private drive").setContentText("Recording GPS to your device. Open Watchout to sync and save.").setSmallIcon(R.drawable.ic_drive_notification).setContentIntent(content).setOngoing(true).addAction(R.drawable.ic_drive_notification,"Stop recording",stopAction).build();
        try{
            if(Build.VERSION.SDK_INT>=29) startForeground(1001,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(1001,notification);
            if(locations.isProviderEnabled(LocationManager.GPS_PROVIDER))locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,5000,0,this,Looper.getMainLooper());
            if(locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,5000,0,this,Looper.getMainLooper());
        }catch(SecurityException|IllegalStateException e){prefs.edit().putBoolean("active",false).apply();stopSelf();}
        // Do not silently restart capture after process death. Durable queue survives;
        // user must explicitly restart recording while the activity is visible.
        return START_NOT_STICKY;
    }
    @Override public void onLocationChanged(Location location) {
        if(!recording)return;
        if(!location.hasAccuracy()||System.currentTimeMillis()-location.getTime()>15000||location.getTime()>System.currentTimeMillis()+1000)return;
        long prior=prefs.getLong("lastFix",0);if(location.getTime()<=prior)return;
        store.insert(drive,sequence,location);
        sequence++;prefs.edit().putInt("sequence",sequence).putLong("lastFix",location.getTime()).commit();
    }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String p,int status,Bundle extras) {}
    public void stopCapture(){recording=false;if(locations!=null)locations.removeUpdates(this);prefs.edit().putBoolean("active",false).commit();stopSelf();}
    @Override public void onDestroy() { recording=false;instance=null;if(locations!=null)locations.removeUpdates(this);if(prefs!=null)prefs.edit().putBoolean("active",false).commit();if(store!=null)store.close();stopForeground(true);super.onDestroy(); }
    @Override public IBinder onBind(Intent i){return null;}
}
