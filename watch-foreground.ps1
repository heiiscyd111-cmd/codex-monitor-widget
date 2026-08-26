Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindowReader {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

while ($true) {
  try {
    $handle = [ForegroundWindowReader]::GetForegroundWindow()
    $processId = [uint32]0
    [void][ForegroundWindowReader]::GetWindowThreadProcessId($handle, [ref]$processId)
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) { [Console]::WriteLine($process.ProcessName) } else { [Console]::WriteLine("") }
  } catch {
    [Console]::WriteLine("")
  }
  Start-Sleep -Milliseconds 700
}
