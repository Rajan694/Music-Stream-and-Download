import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/common/platform/download_dir.dart';

final downloadDirProvider = Provider<DownloadDirService>((ref) {
  return DownloadDirServiceImpl();
});

class FileIOTestScreen extends ConsumerStatefulWidget {
  const FileIOTestScreen({super.key});

  @override
  ConsumerState<FileIOTestScreen> createState() => _FileIOTestScreenState();
}

class _FileIOTestScreenState extends ConsumerState<FileIOTestScreen> {
  String? _downloadFolder;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDownloadFolder();
  }

  Future<void> _loadDownloadFolder() async {
    final downloadDir = ref.read(downloadDirProvider);
    final folder = await downloadDir.getDownloadFolder();
    if (mounted) {
      setState(() {
        _downloadFolder = folder;
        _isLoading = false;
      });
    }
  }

  Future<void> _pickFolder() async {
    final downloadDir = ref.read(downloadDirProvider);
    final path = await downloadDir.pickDownloadFolder();
    if (path != null && mounted) {
      setState(() => _downloadFolder = path);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('M0 File I/O Test')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Download Folder:', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(_isLoading ? 'Loading...' : _downloadFolder ?? 'No folder selected'),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _pickFolder,
              child: const Text('Pick Download Folder'),
            ),
          ],
        ),
      ),
    );
  }
}