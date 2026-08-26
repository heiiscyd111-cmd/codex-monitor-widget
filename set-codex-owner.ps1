param(
  [Parameter(Mandatory = $true)]
  [Int64]$WidgetHandle
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CodexWidgetOwner {
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtr", SetLastError=true)]
  public static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

  [DllImport("user32.dll", EntryPoint="SetWindowLong", SetLastError=true)]
  public static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

  public static IntPtr SetOwner(IntPtr hWnd, IntPtr owner) {
    return IntPtr.Size == 8
      ? SetWindowLongPtr64(hWnd, -8, owner)
      : SetWindowLong32(hWnd, -8, owner);
  }
}
"@

$codex = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Sort-Object StartTime |
  Select-Object -First 1

$owner = if ($codex) { [IntPtr]$codex.MainWindowHandle } else { [IntPtr]::Zero }
[void][CodexWidgetOwner]::SetOwner([IntPtr]$WidgetHandle, $owner)
