using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Freecam Setup")]
[assembly: AssemblyVersion("0.1.1.0")]
[assembly: AssemblyCopyright("Copyright © 2026 bimo0o")]

// The desktop process serves only embedded, allowlisted static files on loopback.
// OBS authentication and operations stay in the existing browser client.
internal static class FreecamSetup {
    static readonly Dictionary<string, byte[]> Assets = new Dictionary<string, byte[]>();
    static TcpListener listener;
    static string authority;
    static string url;

    [STAThread]
    static void Main(string[] args) {
        try {
            using (var reader = new BinaryReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("FreecamAssets"))) {
                int count = reader.ReadInt32();
                for (int i = 0; i < count; i++) {
                    string name = Encoding.UTF8.GetString(reader.ReadBytes(reader.ReadInt32()));
                    Assets.Add(name, reader.ReadBytes(reader.ReadInt32()));
                }
            }
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            authority = "127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port;
            url = "http://" + authority + "/setup.html";
            var thread = new Thread(Accept); thread.IsBackground = true; thread.Start();
            if (args.Length == 2 && args[0] == "--headless") {
                File.WriteAllText(args[1], url);
                Thread.Sleep(Timeout.Infinite);
                return;
            }
            Application.EnableVisualStyles();
            var form = new Form { Text = "Freecam Setup", ClientSize = new Size(550, 285),
                BackColor = Color.FromArgb(18, 14, 26), ForeColor = Color.White,
                Font = new Font("Segoe UI", 11), FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false, StartPosition = FormStartPosition.CenterScreen };
            form.Controls.Add(new Label { Text = "◈ freecam", Font = new Font("Segoe UI", 23, FontStyle.Bold),
                ForeColor = Color.FromArgb(198,157,248), Location = new Point(25,20), Size = new Size(490,50) });
            form.Controls.Add(new Label { Text = "Мастер открыт в вашем браузере.\nПодключите OBS и выберите игру и камеру.\nОставьте это окно открытым до завершения настройки.",
                Location = new Point(28,86), Size = new Size(495,85) });
            var open = new Button { Text = "Открыть мастер ещё раз", Location = new Point(28,190), Size = new Size(270,42),
                BackColor = Color.FromArgb(191,152,242), ForeColor = Color.FromArgb(32,21,44), FlatStyle = FlatStyle.Flat };
            open.Click += delegate { Open(); }; form.Controls.Add(open);
            form.Controls.Add(new Label { Text = "Эфир автоматически не запускается.", Location = new Point(28,246), Size = new Size(490,25) });
            form.Shown += delegate { Open(); };
            form.FormClosed += delegate { listener.Stop(); };
            Application.Run(form);
        } catch (Exception) {
            if (args.Length > 0 && args[0] == "--headless") Environment.Exit(1);
            MessageBox.Show("Не удалось открыть Freecam. Закройте приложение и запустите его снова.", "Freecam Setup");
        }
    }
    static void Open() { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
    static void Accept() {
        try { while (true) { TcpClient client = listener.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(delegate { Serve(client); }); } }
        catch (SocketException) { } catch (ObjectDisposedException) { }
    }
    static void Serve(TcpClient client) {
        using (client) {
            try {
                client.ReceiveTimeout = 4000; client.SendTimeout = 4000;
                using (NetworkStream stream = client.GetStream()) {
                    var request = new StringBuilder(); int next;
                    while (request.Length < 8192 && (next = stream.ReadByte()) >= 0) {
                        request.Append((char)next);
                        if (request.Length >= 4 && request.ToString(request.Length - 4,4) == "\r\n\r\n") break;
                    }
                    string[] lines = request.ToString().Split(new[] { "\r\n" }, StringSplitOptions.None);
                    string[] first = lines[0].Split(' ');
                    string host = "", origin = "";
                    foreach (string line in lines) {
                        if (line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase)) host = line.Substring(5).Trim();
                        if (line.StartsWith("Origin:", StringComparison.OrdinalIgnoreCase)) origin = line.Substring(7).Trim();
                    }
                    byte[] body = new byte[0]; string code = "400 Bad Request", type = "text/plain; charset=utf-8";
                    if (host != authority || (origin != "" && origin != "http://" + authority)) code = "403 Forbidden";
                    else if (first.Length == 3 && (first[0] == "GET" || first[0] == "HEAD")) {
                        string path = first[1].Split('?')[0]; if (path == "/") path = "/setup.html";
                        if (Assets.TryGetValue(path, out body)) {
                            code = "200 OK";
                            type = path.EndsWith(".html") ? "text/html; charset=utf-8" : path.EndsWith(".js") ? "text/javascript; charset=utf-8" : path.EndsWith(".css") ? "text/css; charset=utf-8" : "text/plain; charset=utf-8";
                        } else { code = "404 Not Found"; body = new byte[0]; }
                    }
                    string headers = "HTTP/1.1 " + code + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length
                        + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer"
                        + "\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'\r\n\r\n";
                    byte[] encoded = Encoding.ASCII.GetBytes(headers); stream.Write(encoded,0,encoded.Length);
                    if (first[0] != "HEAD") stream.Write(body,0,body.Length);
                }
            } catch (IOException) { } catch (SocketException) { }
        }
    }
}
