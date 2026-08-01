//! Returning freed memory to the operating system.
//!
//! Dropping a source's plugin frees its pages to *the allocator*, not to the
//! system. Every platform's allocator then keeps them on a free list against
//! the next request, which is the right default for a process that is about to
//! allocate again -- and the wrong one for an app that has just given up tens
//! of megabytes it will not need until the user opens that source again. The
//! figure Task Manager and Activity Monitor report is resident memory, so
//! without this the eviction sweep is invisible: the number never comes down.
//!
//! Each arm below is that platform's documented way to ask for the free lists
//! to be handed back. All of them are advisory -- none is guaranteed to release
//! a specific amount -- so this is a hint, not a contract, and every caller
//! treats it as one.

/// Asks the allocator to return whatever it is holding back to the OS.
///
/// Only worth calling after something substantial has been dropped: it walks
/// the allocator's free lists, so calling it on a hot path would cost more than
/// it saves. The eviction sweep is the intended caller.
pub fn release_to_os() {
    unsafe { platform_release() }
}

#[cfg(all(target_os = "linux", target_env = "gnu"))]
unsafe fn platform_release() {
    unsafe extern "C" {
        fn malloc_trim(pad: usize) -> i32;
    }

    // Measured on the extension workload: recovers most of what dropping the
    // plugins leaves behind in glibc's arenas.
    unsafe { malloc_trim(0) };
}

#[cfg(target_os = "macos")]
unsafe fn platform_release() {
    unsafe extern "C" {
        fn malloc_zone_pressure_relief(
            zone: *mut core::ffi::c_void,
            goal: usize,
        ) -> usize;
    }

    // A null zone means every zone, and a goal of 0 means "as much as you can".
    // This is the same call the system makes on memory pressure, which is
    // exactly the situation an idle app holding freed pages is in.
    unsafe { malloc_zone_pressure_relief(core::ptr::null_mut(), 0) };
}

#[cfg(target_os = "windows")]
unsafe fn platform_release() {
    use windows_sys::Win32::System::Memory::{
        GetProcessHeap, HeapCompact, SetProcessWorkingSetSizeEx,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;

    unsafe {
        // Coalesces the heap's free blocks so the runs it decommits are worth
        // decommitting. On its own this rarely moves the reported figure -- the
        // pages stay committed to the process -- which is what the second call
        // is for.
        let heap = GetProcessHeap();
        if !heap.is_null() {
            HeapCompact(heap, 0);
        }

        // `usize::MAX` for both bounds is the documented way to ask Windows to
        // trim the working set. Anything still in use is paged straight back in,
        // so the cost is a handful of soft faults -- acceptable on the idle path
        // this runs on, and it is what makes the number the user is watching
        // come down.
        SetProcessWorkingSetSizeEx(GetCurrentProcess(), usize::MAX, usize::MAX, 0);
    }
}

#[cfg(not(any(
    all(target_os = "linux", target_env = "gnu"),
    target_os = "macos",
    target_os = "windows"
)))]
unsafe fn platform_release() {
    // musl, the BSDs: no portable equivalent, and their allocators are less
    // prone to holding on in the first place. Dropping the plugin is the whole
    // of the fix there.
}
