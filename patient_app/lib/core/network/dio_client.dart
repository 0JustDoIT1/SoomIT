import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DioClient {
  DioClient._();

  static const String _baseUrl = String.fromEnvironment('API_BASE_URL');

  static const String _accessTokenKey = 'patient_access_token';

  static const String _refreshTokenKey = 'patient_refresh_token';

  static const String _refreshRetryKey = 'retried_after_token_refresh';

  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<bool>? _refreshFuture;

  static final Dio instance = _createDio();

  static Future<bool> hasAccessToken() async {
    final accessToken = await _storage.read(key: _accessTokenKey);

    return accessToken != null && accessToken.isNotEmpty;
  }

  static Dio _createDio() {
    final dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final accessToken = await _storage.read(key: _accessTokenKey);

          if (accessToken != null && accessToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $accessToken';
          }

          handler.next(options);
        },
        onError: (error, handler) async {
          final requestOptions = error.requestOptions;

          final alreadyRetried = requestOptions.extra[_refreshRetryKey] == true;

          if (error.response?.statusCode != 401 || alreadyRetried) {
            handler.next(error);
            return;
          }

          final refreshed = await _refreshSession();

          if (!refreshed) {
            handler.next(error);
            return;
          }

          final newAccessToken = await _storage.read(key: _accessTokenKey);

          if (newAccessToken == null || newAccessToken.isEmpty) {
            handler.next(error);
            return;
          }

          requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';

          requestOptions.extra[_refreshRetryKey] = true;

          try {
            final response = await dio.fetch<dynamic>(requestOptions);

            handler.resolve(response);
          } on DioException catch (retryError) {
            handler.next(retryError);
          } catch (retryError) {
            handler.next(
              DioException(requestOptions: requestOptions, error: retryError),
            );
          }
        },
      ),
    );

    return dio;
  }

  static Future<bool> _refreshSession() {
    final ongoingRefresh = _refreshFuture;

    if (ongoingRefresh != null) {
      return ongoingRefresh;
    }

    final refreshFuture = _performRefresh();

    _refreshFuture = refreshFuture;

    refreshFuture.whenComplete(() {
      if (identical(_refreshFuture, refreshFuture)) {
        _refreshFuture = null;
      }
    });

    return refreshFuture;
  }

  static Future<bool> _performRefresh() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);

    if (refreshToken == null || refreshToken.isEmpty) {
      return false;
    }

    final refreshDio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    try {
      final response = await refreshDio.post(
        '/api/patients/auth/token/refresh/',
        data: {'refresh': refreshToken},
      );

      final data = response.data;

      if (data is! Map || data['status'] != 'TOKEN_REFRESHED') {
        return false;
      }

      final newAccessToken = data['access'];
      final newRefreshToken = data['refresh'];

      if (newAccessToken is! String ||
          newAccessToken.isEmpty ||
          newRefreshToken is! String ||
          newRefreshToken.isEmpty) {
        return false;
      }

      await Future.wait([
        _storage.write(key: _accessTokenKey, value: newAccessToken),
        _storage.write(key: _refreshTokenKey, value: newRefreshToken),
      ]);

      return true;
    } on DioException catch (error) {
      final statusCode = error.response?.statusCode;

      if (statusCode == 400 || statusCode == 401 || statusCode == 403) {
        await _deleteStoredTokens();
      }

      return false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> _deleteStoredTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }
}
