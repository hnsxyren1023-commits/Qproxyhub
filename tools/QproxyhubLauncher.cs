using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

internal static class QproxyhubLauncher
{
    [STAThread]
    private static void Main()
    {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var scriptPath = Path.Combine(root, "start-proxy-tester.ps1");
        var nodePath = @"C:\Program Files\nodejs\node.exe";
        var mihomoPath = @"C:\Program Files\mihomo-windows-amd64-v1.19.24\mihomo-windows-amd64.exe";

        if (!File.Exists(scriptPath))
        {
            MessageBox.Show(
                "未找到 start-proxy-tester.ps1，请确认 Qproxyhub.exe 与项目文件放在同一目录。",
                "Qproxyhub",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        if (!File.Exists(nodePath))
        {
            MessageBox.Show(
                "未找到 Node.js，请先安装 Node.js 24+。\n默认检查路径：C:\\Program Files\\nodejs\\node.exe",
                "Qproxyhub",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        if (!File.Exists(mihomoPath))
        {
            MessageBox.Show(
                "未找到 mihomo 内核，请先准备可用的 mihomo-windows-amd64。\n默认检查路径：C:\\Program Files\\mihomo-windows-amd64-v1.19.24\\mihomo-windows-amd64.exe",
                "Qproxyhub",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }

        var powerShell = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = string.Format("-ExecutionPolicy Bypass -File \"{0}\"", scriptPath),
            WorkingDirectory = root,
            UseShellExecute = true
        };

        try
        {
            Process.Start(powerShell);
            Thread.Sleep(1800);
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://127.0.0.1:8866/",
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "启动失败：\n" + ex.Message,
                "Qproxyhub",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
