package app.watchout.android;
import android.content.Context;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteDatabase;
import android.database.Cursor;
import android.location.Location;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.time.Instant;
final class DriveStore extends SQLiteOpenHelper {
    DriveStore(Context c) { super(c,"private-drive-queue.db",null,1); }
    @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE queue(drive TEXT NOT NULL, seq INTEGER NOT NULL, observed TEXT NOT NULL, lat REAL, lon REAL, accuracy REAL, speed REAL, PRIMARY KEY(drive,seq))"); }
    @Override public void onUpgrade(SQLiteDatabase db,int a,int b) { throw new IllegalStateException("Migration required"); }
    synchronized void insert(String drive,int sequence,Location fix) {
        getWritableDatabase().execSQL("INSERT OR IGNORE INTO queue VALUES(?,?,?,?,?,?,?)",new Object[]{drive,sequence,Instant.ofEpochMilli(fix.getTime()).toString(),fix.getLatitude(),fix.getLongitude(),fix.getAccuracy(),fix.hasSpeed()?Math.max(0,fix.getSpeed()):null});
    }
    JSArray samples(String drive) {
        JSArray rows=new JSArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT * FROM queue WHERE drive=? ORDER BY seq",new String[]{drive})) {
            while(c.moveToNext()) { JSObject s=new JSObject(); s.put("sequence",c.getInt(1));s.put("observedAt",c.getString(2));s.put("latitude",c.getDouble(3));s.put("longitude",c.getDouble(4));s.put("accuracy",c.getDouble(5));s.put("speed",c.isNull(6)?org.json.JSONObject.NULL:c.getDouble(6)); rows.put(s); }
        }
        return rows;
    }
    void acknowledge(String drive,int sequence) { getWritableDatabase().delete("queue","drive=? AND seq<=?",new String[]{drive,Integer.toString(sequence)}); }
}
