// Restores the user's prior WinINet proxy after EOF, parent exit, or engine exit.
// This helper outlives Electron, so renderer/main crashes cannot leave our proxy set.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

class ProxyGuard {
    const string RegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    static readonly string[] Names = {"ProxyEnable", "ProxyServer", "ProxyOverride", "AutoConfigURL"};
    [DllImport("wininet.dll", SetLastError=true)] static extern bool InternetSetOption(IntPtr h, int option, IntPtr buffer, int length);
    static void Notify() {InternetSetOption(IntPtr.Zero,39,IntPtr.Zero,0);InternetSetOption(IntPtr.Zero,37,IntPtr.Zero,0);}
    static void Restore(RegistryKey key, string backup, string owner, JavaScriptSerializer json) {
        if (!File.Exists(backup)) return;
        var saved=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(backup));
        if ((string)key.GetValue("ProxyServer", "") == (string)saved["owner"]) {
            foreach (string name in Names) {
                object value=saved[name];
                if (value==null) key.DeleteValue(name,false);
                else key.SetValue(name,value,name=="ProxyEnable"?RegistryValueKind.DWord:RegistryValueKind.String);
            }
            Notify();
        }
        File.Delete(backup);
    }
    static int Main(string[] args) {
        if(args.Length==2 && args[0]=="--recover") {
            using(var recovery=new Mutex(false,@"Local\MiniThroneProxyGuard")) {
                if(!recovery.WaitOne(2000))return 73;
                try {using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath,true)) {if(key!=null)Restore(key,Path.GetFullPath(args[1]),"",new JavaScriptSerializer());}return 0;}
                catch{return 74;} finally{recovery.ReleaseMutex();}
            }
        }
        if(args.Length==3 && args[0]=="--watch") {
            try {
                using(var parent=Process.GetProcessById(int.Parse(args[1])))
                using(var engine=Process.GetProcessById(int.Parse(args[2]))) {
                    while(!parent.HasExited&&!engine.HasExited)Thread.Sleep(250);
                    if(!engine.HasExited) {
                        var stop=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"taskkill.exe"),"/PID "+engine.Id+" /T /F");
                        stop.UseShellExecute=false;stop.CreateNoWindow=true;stop.WindowStyle=ProcessWindowStyle.Hidden;
                        using(var process=Process.Start(stop)){process.WaitForExit(10000);}
                    }
                }
                return 0;
            } catch {return 74;}
        }
        if(args.Length!=4)return 64;
        int parentId,engineId,port;
        if(!int.TryParse(args[0],out parentId)||!int.TryParse(args[1],out engineId)||!int.TryParse(args[2],out port)||port<1||port>65535)return 64;
        string backup=Path.GetFullPath(args[3]), owner="127.0.0.1:"+port;
        var json=new JavaScriptSerializer();
        bool owned=false;
        using(var mutex=new Mutex(false,@"Local\MiniThroneProxyGuard")) {
            if(!mutex.WaitOne(0))return 73;
            try {
                using(var parent=Process.GetProcessById(parentId))
                using(var engine=Process.GetProcessById(engineId))
                using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath,true)) {
                    if(key==null)return 74;
                    Restore(key,backup,owner,json);
                    var values=new Dictionary<string,object>();values["owner"]=owner;
                    foreach(string name in Names) values[name]=key.GetValue(name);
                    File.WriteAllText(backup,json.Serialize(values));
                    try {
                        key.SetValue("ProxyServer",owner,RegistryValueKind.String);
                        owned=true;
                        key.SetValue("ProxyOverride","<local>;localhost;127.*;[::1]",RegistryValueKind.String);
                        key.SetValue("ProxyEnable",1,RegistryValueKind.DWord);
                        key.DeleteValue("AutoConfigURL",false);
                        Notify();
                        Console.WriteLine("READY");Console.Out.Flush();
                        using(var eof=new ManualResetEvent(false)) {
                            var reader=new Thread(()=>{try{while(Console.Read()!=-1){} }catch{} finally{try{eof.Set();}catch(ObjectDisposedException){}}});reader.IsBackground=true;reader.Start();
                            while(!eof.WaitOne(250)&&!parent.HasExited&&!engine.HasExited){}
                        }
                    } finally {if(owned)Restore(key,backup,owner,json);}
                }
            } catch {return 74;}
            finally {mutex.ReleaseMutex();}
        }
        return 0;
    }
}
