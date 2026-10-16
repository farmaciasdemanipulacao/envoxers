#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{Manager, WindowEvent, image::Image, menu::{Menu,MenuItem}, tray::{TrayIconBuilder,TrayIconEvent,MouseButton,MouseButtonState}};
use tauri_plugin_autostart::{MacosLauncher,ManagerExt};
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
fn native_alert(app: tauri::AppHandle,title:String,body:String)->Result<(),String>{
 if title.len()>200||body.len()>500{return Err("Too long".into());}
 app.notification().builder().title(title).body(body).show().map_err(|e|e.to_string())
}
#[tauri::command]
fn native_badge(window:tauri::WebviewWindow,count:u32)->Result<(),String>{
 #[cfg(windows)]{
   if count==0{return window.set_overlay_icon(None).map_err(|e|e.to_string());}
   let mut rgba=vec![0u8;16*16*4];
   for y in 0..16i32{for x in 0..16i32{
     let d=(x-8)*(x-8)+(y-8)*(y-8);
     if d<64 {let i=((y*16+x)*4) as usize;
       rgba[i..i+4].copy_from_slice(if d>42{&[255,255,255,255]}else{&[220,43,70,255]});
     }
   }}
   window.set_overlay_icon(Some(Image::new_owned(rgba,16,16))).map_err(|e|e.to_string())
 }
 #[cfg(not(windows))]{let _=(window,count);Ok(())}
}
fn abrir(app:&tauri::AppHandle){
 if let Some(win)=app.get_webview_window("main"){let _=win.show();let _=win.unminimize();let _=win.set_focus();}
}
fn main(){
 tauri::Builder::default()
 .plugin(tauri_plugin_single_instance::init(|app,_,_|abrir(app)))
 .plugin(tauri_plugin_notification::init())
 .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent,Some(vec!["--minimized".into()])))
 .invoke_handler(tauri::generate_handler![native_alert,native_badge])
 .setup(|app|{
   let open=MenuItem::with_id(app,"open","Abrir Envoxers",true,None::<&str>)?;
   let startup=MenuItem::with_id(app,"startup","Alternar início com Windows",true,None::<&str>)?;
   let quit=MenuItem::with_id(app,"quit","Encerrar Envoxers",true,None::<&str>)?;
   let menu=Menu::with_items(app,&[&open,&startup,&quit])?;
   TrayIconBuilder::new()
      .icon(app.default_window_icon().unwrap().clone()).tooltip("Envoxers")
      .menu(&menu)
      .on_menu_event(|app,e|match e.id().as_ref(){
        "open"=>abrir(app),
        "startup"=>{let x=app.autolaunch();if x.is_enabled().unwrap_or(false){let _=x.disable();}else{let _=x.enable();}},
        "quit"=>app.exit(0),_=>()
      })
      .on_tray_icon_event(|tray,event|{
        if let TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}=event{abrir(tray.app_handle());}
      }).build(app)?;
   if !app.autolaunch().is_enabled().unwrap_or(false){let _=app.autolaunch().enable();}
   if std::env::args().any(|v|v=="--minimized"){if let Some(w)=app.get_webview_window("main"){let _=w.hide();}}
   Ok(())
 })
 .on_window_event(|win,event|{if let WindowEvent::CloseRequested{api,..}=event{api.prevent_close();let _=win.hide();}})
 .run(tauri::generate_context!()).expect("Envoxers Desktop");
}
