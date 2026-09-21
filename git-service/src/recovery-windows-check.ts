// A suspended child enters its own Windows job before it can spawn descendants.
// Closing the non-inheritable job handle also cleans up when the supervisor crashes.
// https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
export const WINDOWS_CHECK_SCRIPT = String.raw`
param([string]$ResultPath, [int]$TimeoutMs)
$ErrorActionPreference = 'Stop'
try {
  $command = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:BITGIT_CHECK_COMMAND_BASE64))
  [Environment]::SetEnvironmentVariable('BITGIT_CHECK_COMMAND_BASE64', $null)
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class BitGitCheckJob {
  [StructLayout(LayoutKind.Sequential)] struct Limits {
    public long ProcessTime, JobTime; public uint Flags;
    public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveLimit;
    public UIntPtr Affinity; public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Io {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public Limits Basic; public Io Counters;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long User, Kernel, PeriodUser, PeriodKernel;
    public uint PageFaults, Total, Active, Terminated;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
    public int Size; public string Reserved, Desktop, Title;
    public uint X, Y, Width, Height, CharsX, CharsY, Fill, Flags;
    public ushort Show, ReservedSize; public IntPtr ReservedPointer, Input, Output, Error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
    public IntPtr Process, Thread; public uint Pid, Tid;
  }
  public class Result {
    public int? exitCode; public bool timedOut, stopped, background;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr security, IntPtr name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint size, IntPtr returned);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessW(string app, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string cwd, ref Startup startup, out ProcessInfo process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Require(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static uint Active(IntPtr job) {
    Accounting info;
    Require(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
    return info.Active;
  }
  public static Result Run(string command, string cwd, int timeout) {
    IntPtr job = CreateJobObjectW(IntPtr.Zero, IntPtr.Zero);
    Require(job != IntPtr.Zero);
    ProcessInfo process = new ProcessInfo();
    bool assigned = false;
    try {
      ExtendedLimits limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway.
      Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
      Startup startup = new Startup(); startup.Size = Marshal.SizeOf(typeof(Startup));
      startup.Flags = 0x100; startup.Input = GetStdHandle(-10); startup.Output = GetStdHandle(-11); startup.Error = GetStdHandle(-12);
      Require(SetHandleInformation(startup.Input, 1, 1));
      Require(SetHandleInformation(startup.Output, 1, 1));
      Require(SetHandleInformation(startup.Error, 1, 1));
      string shell = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
      var line = new StringBuilder("\"" + shell + "\" /d /s /c \"" + command + "\"");
      Require(CreateProcessW(shell, line, IntPtr.Zero, IntPtr.Zero, true, 0x08000004, IntPtr.Zero, cwd, ref startup, out process));
      Require(AssignProcessToJobObject(job, process.Process)); assigned = true;
      Require(ResumeThread(process.Thread) != 0xffffffff);
      uint wait = WaitForSingleObject(process.Process, (uint)timeout);
      Require(wait == 0 || wait == 258);
      var result = new Result(); result.timedOut = wait == 258;
      if (!result.timedOut) {
        uint code; Require(GetExitCodeProcess(process.Process, out code)); result.exitCode = unchecked((int)code);
        // Accounting may briefly lag a normal foreground process exiting.
        for (int i=0; i<10 && Active(job)>0; i++) Thread.Sleep(20);
        result.background = Active(job)>0;
      }
      if (result.timedOut || result.background) Require(TerminateJobObject(job, 1));
      for (int i=0; i<100 && Active(job)>0; i++) Thread.Sleep(20);
      result.stopped = Active(job)==0;
      return result;
    } finally {
      if (process.Process != IntPtr.Zero && !assigned) TerminateProcess(process.Process, 1);
      CloseHandle(job);
      if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
      if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
    }
  }
}
'@
  $result = [BitGitCheckJob]::Run($command, (Get-Location).Path, $TimeoutMs)
} catch {
  $result = @{ exitCode=$null; timedOut=$false; stopped=$false; background=$false; error=$_.Exception.Message }
}
[IO.File]::WriteAllText($ResultPath, ($result | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
`;
