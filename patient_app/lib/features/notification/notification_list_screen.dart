import 'package:flutter/material.dart';

import '../home/models/patient_notification.dart';
import '../home/services/notification_service.dart';

class NotificationListScreen extends StatefulWidget {
  const NotificationListScreen({super.key});

  @override
  State<NotificationListScreen> createState() =>
      _NotificationListScreenState();
}

class _NotificationListScreenState
    extends State<NotificationListScreen> {
  final NotificationService _notificationService =
      NotificationService();

  late Future<List<PatientNotification>>
      _notificationsFuture;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  void _loadNotifications() {
    _notificationsFuture =
        _notificationService.getNotifications();
  }

  Future<void> _refreshNotifications() async {
    setState(() {
      _loadNotifications();
    });

    await _notificationsFuture;
  }

  Future<void> _markAsRead(
    PatientNotification notification,
  ) async {
    if (notification.isRead) {
      return;
    }

    try {
      await _notificationService.markAsRead(
        notification.id,
      );

      if (!mounted) return;

      setState(() {
        _loadNotifications();
      });
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '알림 읽음 처리에 실패했습니다.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor:
          const Color(0xFFF4F6F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: const Text(
          '알림',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Color(0xFF191F28),
          ),
        ),
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: Color(0xFF191F28),
          ),
          onPressed: () {
            Navigator.pop(context);
          },
        ),
      ),
      body: FutureBuilder<
          List<PatientNotification>>(
        future: _notificationsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState ==
              ConnectionState.waiting) {
            return const Center(
              child:
                  CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return _buildErrorState();
          }

          final notifications =
              snapshot.data ?? [];

          if (notifications.isEmpty) {
            return _buildEmptyState();
          }

          return RefreshIndicator(
            onRefresh:
                _refreshNotifications,
            child: ListView.separated(
              physics:
                  const AlwaysScrollableScrollPhysics(),
              padding:
                  const EdgeInsets.all(16),
              itemCount:
                  notifications.length,
              separatorBuilder:
                  (_, __) =>
                      const SizedBox(
                height: 10,
              ),
              itemBuilder:
                  (context, index) {
                final notification =
                    notifications[index];

                return _buildNotificationCard(
                  notification,
                );
              },
            ),
          );
        },
      ),
    );
  }

  Widget _buildNotificationCard(
    PatientNotification notification,
  ) {
    return InkWell(
      borderRadius:
          BorderRadius.circular(16),
      onTap: () async {
        await _markAsRead(
          notification,
        );

        if (!mounted) return;

        _showNotificationDetail(
          notification,
        );
      },
      child: Container(
        width: double.infinity,
        padding:
            const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius:
              BorderRadius.circular(16),
          border:
              notification.isRead
                  ? null
                  : Border.all(
                      color:
                          const Color(
                        0xFFDCE9FF,
                      ),
                    ),
        ),
        child: Row(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            _buildNotificationIcon(
              notification
                  .notificationType,
            ),

            const SizedBox(width: 14),

            Expanded(
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          notification
                              .title,
                          style:
                              TextStyle(
                            fontSize: 15,
                            fontWeight:
                                notification
                                        .isRead
                                    ? FontWeight
                                        .w500
                                    : FontWeight
                                        .bold,
                            color:
                                const Color(
                              0xFF191F28,
                            ),
                          ),
                        ),
                      ),

                      if (!notification
                          .isRead)
                        Container(
                          width: 8,
                          height: 8,
                          decoration:
                              const BoxDecoration(
                            shape:
                                BoxShape.circle,
                            color:
                                Color(
                              0xFF3B82F6,
                            ),
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: 6),

                  Text(
                    notification.message,
                    style:
                        const TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      color:
                          Color(
                        0xFF6B7684,
                      ),
                    ),
                  ),

                  const SizedBox(height: 10),

                  Text(
                    _formatDateTime(
                      notification
                          .createdAt,
                    ),
                    style:
                        const TextStyle(
                      fontSize: 12,
                      color:
                          Color(
                        0xFFB0B8C1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotificationIcon(
    String type,
  ) {
    IconData icon;

    switch (type) {
      case 'APPOINTMENT':
        icon =
            Icons.calendar_month_rounded;
        break;

      case 'EXAMINATION':
        icon =
            Icons.biotech_rounded;
        break;

      case 'RESULT':
        icon =
            Icons.description_rounded;
        break;

      case 'MEDICATION':
        icon =
            Icons.medication_rounded;
        break;

      case 'QUESTIONNAIRE':
        icon =
            Icons.assignment_rounded;
        break;

      case 'HEALTH':
        icon =
            Icons.favorite_rounded;
        break;

      default:
        icon =
            Icons.notifications_rounded;
    }

    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color:
            const Color(0xFFEAF2FF),
        borderRadius:
            BorderRadius.circular(12),
      ),
      child: Icon(
        icon,
        size: 22,
        color:
            const Color(0xFF3B82F6),
      ),
    );
  }

  Widget _buildEmptyState() {
    return RefreshIndicator(
      onRefresh:
          _refreshNotifications,
      child: ListView(
        physics:
            const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 180),
          Icon(
            Icons
                .notifications_none_rounded,
            size: 52,
            color:
                Color(0xFFB0B8C1),
          ),
          SizedBox(height: 14),
          Center(
            child: Text(
              '새로운 알림이 없습니다.',
              style: TextStyle(
                fontSize: 14,
                color:
                    Color(
                  0xFF8B95A1,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisSize:
            MainAxisSize.min,
        children: [
          const Text(
            '알림을 불러오지 못했습니다.',
            style: TextStyle(
              color:
                  Color(0xFF8B95A1),
            ),
          ),

          const SizedBox(height: 12),

          TextButton(
            onPressed: () {
              setState(() {
                _loadNotifications();
              });
            },
            child:
                const Text('다시 시도'),
          ),
        ],
      ),
    );
  }

  void _showNotificationDetail(
    PatientNotification notification,
  ) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding:
                const EdgeInsets.fromLTRB(
              20,
              4,
              20,
              24,
            ),
            child: Column(
              mainAxisSize:
                  MainAxisSize.min,
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  notification.title,
                  style:
                      const TextStyle(
                    fontSize: 18,
                    fontWeight:
                        FontWeight.bold,
                    color:
                        Color(
                      0xFF191F28,
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                Text(
                  notification.message,
                  style:
                      const TextStyle(
                    fontSize: 14,
                    height: 1.5,
                    color:
                        Color(
                      0xFF4E5968,
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                Text(
                  _formatDateTime(
                    notification
                        .createdAt,
                  ),
                  style:
                      const TextStyle(
                    fontSize: 12,
                    color:
                        Color(
                      0xFF8B95A1,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _formatDateTime(
    DateTime dateTime,
  ) {
    final local =
        dateTime.toLocal();

    final year =
        local.year.toString();
    final month =
        local.month
            .toString()
            .padLeft(2, '0');
    final day =
        local.day
            .toString()
            .padLeft(2, '0');
    final hour =
        local.hour
            .toString()
            .padLeft(2, '0');
    final minute =
        local.minute
            .toString()
            .padLeft(2, '0');

    return '$year.$month.$day $hour:$minute';
  }
}