import 'package:google_sign_in/google_sign_in.dart';

class GoogleAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

  Future<void>? _initialization;

  Future<void> _ensureInitialized() {
    return _initialization ??= _googleSignIn.initialize();
  }

  Future<String> signInAndGetIdToken() async {
    await _ensureInitialized();

    if (!_googleSignIn.supportsAuthenticate()) {
      throw Exception('현재 환경에서는 Google 로그인을 지원하지 않습니다.');
    }

    final account = await _googleSignIn.authenticate();

    final idToken = account.authentication.idToken;

    if (idToken == null || idToken.isEmpty) {
      throw Exception('Google ID token을 발급받지 못했습니다.');
    }

    return idToken;
  }

  Future<void> signOut() async {
    await _ensureInitialized();
    await _googleSignIn.signOut();
  }
}
