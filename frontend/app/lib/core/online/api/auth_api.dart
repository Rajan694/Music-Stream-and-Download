import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dio_client.dart';

final authApiProvider = Provider((ref) {
  final dio = ref.watch(dioProvider);
  return AuthApi(dio);
});

class AuthApi {
  final Dio _dio;

  AuthApi(this._dio);

  Future<LoginResponse> login(String email, String password) async {
    final response = await _dio.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );

    if (response.statusCode != 200) {
      throw Exception('Login failed: ${response.data['message']}');
    }

    return LoginResponse.fromJson(response.data);
  }

  Future<LoginResponse> register(String email, String password) async {
    final response = await _dio.post(
      '/auth/register',
      data: {'email': email, 'password': password},
    );

    if (response.statusCode != 201) {
      throw Exception('Registration failed: ${response.data['message']}');
    }

    return LoginResponse.fromJson(response.data);
  }

  Future<MeResponse> getMe() async {
    final response = await _dio.get('/auth/me');

    if (response.statusCode != 200) {
      throw Exception('Failed to get user info');
    }

    return MeResponse.fromJson(response.data);
  }

  Future<void> logout() async {
    await _dio.post('/auth/logout');
  }
}

class LoginResponse {
  final String id;
  final String email;
  final String role;
  final String accessToken;
  final String? refreshToken;

  LoginResponse({
    required this.id,
    required this.email,
    required this.role,
    required this.accessToken,
    this.refreshToken,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      id: json['user']['id'],
      email: json['user']['email'],
      role: json['user']['role'] ?? 'USER',
      accessToken: json['accessToken'],
      refreshToken: json['refreshToken'],
    );
  }
}

class MeResponse {
  final String id;
  final String email;
  final String role;
  final DateTime createdAt;

  MeResponse({
    required this.id,
    required this.email,
    required this.role,
    required this.createdAt,
  });

  factory MeResponse.fromJson(Map<String, dynamic> json) {
    return MeResponse(
      id: json['id'],
      email: json['email'],
      role: json['role'] ?? 'USER',
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}
