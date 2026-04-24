mod desktop_ini;
mod icon_apply;
mod backend;
mod runtime;
mod bg_removal;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{App, Manager, RunEvent};
use serde::Serialize;

use crate::icon_apply::{
    apply_folder_icon,
    apply_ready_icons,
    can_restore_folder_icon,
    clear_folder_icon,
    restore_last_folder_icon,
    restore_ready_icons,
};

#[tauri::command]
fn pick_directory() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn pick_directories() -> Option<Vec<String>> {
    rfd::FileDialog::new().pick_folders().map(|paths| {
        paths
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect()
    })
}

#[tauri::command]
fn pick_files() -> Option<Vec<String>> {
    rfd::FileDialog::new().pick_files().map(|paths| {
        paths
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect()
    })
}

#[derive(Serialize)]
struct InspectedPath {
    path: String,
    is_dir: bool,
    is_file: bool,
}

#[derive(Serialize)]
struct DirectoryEntry {
    path: String,
    is_dir: bool,
    is_file: bool,
}

#[tauri::command]
fn inspect_paths(paths: Vec<String>) -> Vec<InspectedPath> {
    paths
        .into_iter()
        .map(|path| {
            let metadata = fs::metadata(&path).ok();
            let is_dir = metadata.as_ref().is_some_and(|item| item.is_dir());
            let is_file = metadata.as_ref().is_some_and(|item| item.is_file());

            InspectedPath {
                path,
                is_dir,
                is_file,
            }
        })
        .collect()
}

#[tauri::command]
fn list_directory_entries(path: String) -> Result<Vec<DirectoryEntry>, String> {
    let directory = PathBuf::from(&path);
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("failed to read directory {}: {error}", directory.display()))?;

    let mut result: Vec<DirectoryEntry> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();
            if name.starts_with('.') {
                return None;
            }

            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            Some(DirectoryEntry {
                path: path.to_string_lossy().into_owned(),
                is_dir: metadata.is_dir(),
                is_file: metadata.is_file(),
            })
        })
        .collect();

    result.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });

    Ok(result)
}

#[tauri::command]
fn save_file_as(source_path: String, filename: String) -> Result<bool, String> {
    let save_path = rfd::FileDialog::new()
        .set_file_name(&filename)
        .add_filter("PNG Image", &["png"])
        .save_file();

    if let Some(dest) = save_path {
        fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, using /select opens the parent folder and highlights the item
        let _ = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        // On macOS, -R flag in open command reveals it in Finder
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // For linux, just open the parent for now if it's a folder, or the path directly
        let _ = std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn();
    }
    Ok(())
}


struct DesktopState {
    project_root: PathBuf,
    backend_executable: Option<PathBuf>,
    backend_process: Mutex<Option<backend::ManagedBackendProcess>>,
    runtime_script: Mutex<Option<String>>,
    injected_runtime: Mutex<Option<runtime::InjectedRuntimeConfig>>,
}

impl DesktopState {
    fn new(project_root: PathBuf, backend_executable: Option<PathBuf>) -> Self {
        Self {
            project_root,
            backend_executable,
            backend_process: Mutex::new(None),
            runtime_script: Mutex::new(None),
            injected_runtime: Mutex::new(None),
        }
    }

    fn set_backend_process(&self, process: backend::ManagedBackendProcess) {
        let mut guard = self.backend_process.lock().expect("backend process lock");
        *guard = Some(process);
    }

    fn set_runtime_script(&self, script: String) {
        let mut guard = self.runtime_script.lock().expect("runtime script lock");
        *guard = Some(script);
    }

    fn set_injected_runtime(&self, runtime_config: runtime::InjectedRuntimeConfig) {
        let mut guard = self.injected_runtime.lock().expect("injected runtime lock");
        *guard = Some(runtime_config);
    }

    fn runtime_script(&self) -> Option<String> {
        self.runtime_script.lock().expect("runtime script lock").clone()
    }

    fn injected_runtime(&self) -> Option<runtime::InjectedRuntimeConfig> {
        self.injected_runtime.lock().expect("injected runtime lock").clone()
    }

    fn stop_backend(&self) {
        if let Some(mut process) = self.backend_process.lock().expect("backend process lock").take() {
            let _ = backend::terminate_backend_process(&mut process);
        }
    }
}

fn resolve_project_root() -> PathBuf {
    if let Some(project_root) = std::env::var_os("FILE_ORGANIZER_PROJECT_ROOT") {
        return PathBuf::from(project_root);
    }

    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("project root should exist above desktop/src-tauri")
        .to_path_buf()
}

fn resolve_bundled_backend_executable(app: &App) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("failed to resolve resource dir: {error}"))?;
    let candidates = [
        resource_dir.join("backend").join("file_organizer_api.exe"),
        resource_dir.join("file_organizer_api.exe"),
    ];

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            format!(
                "bundled backend executable was not found under {}",
                resource_dir.display()
            )
        })
}

fn resolve_desktop_state(app: &App) -> Result<DesktopState, String> {
    if tauri::is_dev() {
        let project_root = resolve_project_root();
        return Ok(DesktopState::new(project_root, None));
    }

    let project_root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
    fs::create_dir_all(&project_root)
        .map_err(|error| format!("failed to create app data dir {}: {error}", project_root.display()))?;
    let backend_executable = resolve_bundled_backend_executable(app)?;
    Ok(DesktopState::new(project_root, Some(backend_executable)))
}

fn bootstrap_backend(app: &App) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    let runtime_path = runtime::backend_runtime_path(&state.project_root);
    if runtime_path.exists() {
        match runtime::read_runtime_config(&runtime_path) {
            Ok(config) if runtime::runtime_file_is_owned_by_active_backend(&config, Duration::from_millis(250)) => {
                return Err(format!(
                    "runtime file {} is already owned by an active backend instance",
                    runtime_path.display()
                ));
            }
            Ok(_) | Err(_) => {
                fs::remove_file(&runtime_path).map_err(|error| {
                    format!("failed to clear stale runtime file {}: {error}", runtime_path.display())
                })?;
            }
        }
    }

    let launch = backend::start_backend(&state.project_root, state.backend_executable.as_deref())?;
    let expected_pid = if state.backend_executable.is_some() {
        None
    } else {
        Some(launch.process.id())
    };
    let expected_instance_id = launch.instance_id.clone();
    let api_token = launch.api_token.clone();
    let mut process = launch.process;
    let config = match runtime::wait_for_runtime_config(
        &runtime_path,
        Duration::from_secs(20),
        expected_pid,
        &expected_instance_id,
    ) {
        Ok(config) => config,
        Err(error) => {
            let _ = backend::terminate_backend_process(&mut process);
            return Err(error);
        }
    };

    let script = runtime::build_runtime_injection_script(&config, &api_token);
    let injected_runtime = runtime::build_injected_runtime_config(&config, &api_token);
    state.set_backend_process(process);
    state.set_runtime_script(script.clone());
    state.set_injected_runtime(injected_runtime);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&script);
    }

    Ok(())
}

fn rehydrate_runtime(webview: &tauri::Webview) {
    let state = webview.app_handle().state::<DesktopState>();
    if let Some(script) = state.runtime_script() {
        let _ = webview.eval(&script);
    }
}

#[tauri::command]
fn get_runtime_config(app: tauri::AppHandle) -> Option<runtime::InjectedRuntimeConfig> {
    let state = app.state::<DesktopState>();
    state.injected_runtime()
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct SecondaryLaunchAction {
    should_show: bool,
    should_unminimize: bool,
    should_focus: bool,
}

impl SecondaryLaunchAction {
    fn from_window_state(window_exists: bool, is_minimized: bool) -> Self {
        Self {
            should_show: window_exists,
            should_unminimize: window_exists && is_minimized,
            should_focus: window_exists,
        }
    }
}

fn focus_existing_main_window(app_handle: &tauri::AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };

    let action = SecondaryLaunchAction::from_window_state(true, window.is_minimized().unwrap_or(false));
    if action.should_show {
        let _ = window.show();
    }
    if action.should_unminimize {
        let _ = window.unminimize();
    }
    if action.should_focus {
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::SecondaryLaunchAction;

    #[test]
    fn secondary_launch_marks_existing_window_for_focus() {
        let action = SecondaryLaunchAction::from_window_state(true, true);

        assert!(action.should_show);
        assert!(action.should_unminimize);
        assert!(action.should_focus);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_existing_main_window(app);
        }))
        .invoke_handler(tauri::generate_handler![
            pick_directory,
            pick_directories,
            pick_files,
            inspect_paths,
            list_directory_entries,
            open_directory,
            save_file_as,
            get_runtime_config,
            apply_folder_icon,
            apply_ready_icons,
            clear_folder_icon,
            can_restore_folder_icon,
            restore_last_folder_icon,
            restore_ready_icons,
            crate::bg_removal::remove_background_for_image,
            crate::bg_removal::test_bg_removal_connection
        ])
        .setup(|app| {
            let state = resolve_desktop_state(app)?;
            std::env::set_var("FILE_ORGANIZER_PROJECT_ROOT", &state.project_root);
            app.manage(state);
            bootstrap_backend(app).map_err(Into::into)
        })
        .on_page_load(|window, _| {
            rehydrate_runtime(window);
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                let state = app_handle.state::<DesktopState>();
                state.stop_backend();
            }
        });
}
