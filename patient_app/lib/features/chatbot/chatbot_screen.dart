import 'package:flutter/material.dart';

import '../auth/services/patient_auth_service.dart';
import 'services/chatbot_service.dart';

class ChatbotScreen extends StatefulWidget {
  const ChatbotScreen({super.key});

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final ChatbotService _chatbotService = ChatbotService();
  final PatientAuthService _authService = PatientAuthService();

  bool _isReplying = false;

  final List<_ChatMessage> _messages = [
    const _ChatMessage(
      text:
          '안녕하세요 😊\n'
          '숨-잇 안내 챗봇 숨이에요.\n\n'
          '앱 사용방법, 검사 준비사항, '
          '일반 건강정보 등이 궁금하면 편하게 물어보세요!',
      isUser: false,
    ),
  ];

  final List<String> _recommendedQuestions = [
    'CT 검사 전 준비사항',
    '문진표 작성 방법',
    '예약 확인 방법',
    '복약 기록 방법',
  ];

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  Future<String> _requestChatbotAnswer({
    required String message,
    required List<Map<String, String>> history,
  }) async {
    var accessToken = await _authService.getAccessToken();

    if (accessToken == null || accessToken.isEmpty) {
      final refreshed = await _authService.refreshStoredSession();
      if (refreshed) {
        accessToken = await _authService.getAccessToken();
      }
    }

    if (accessToken == null || accessToken.isEmpty) {
      throw Exception('로그인 인증정보를 확인할 수 없습니다.');
    }

    try {
      return await _chatbotService.sendMessage(
        message: message,
        history: history,
        accessToken: accessToken,
      );
    } catch (error) {
      final errorMessage = error.toString();

      final isAuthenticationError =
          errorMessage.contains('인증이 필요합니다.') ||
          errorMessage.contains('401') ||
          errorMessage.contains('Unauthorized');

      if (!isAuthenticationError) {
        rethrow;
      }

      final refreshed = await _authService.refreshStoredSession();

      if (!refreshed) {
        throw Exception('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
      }

      final newAccessToken = await _authService.getAccessToken();

      if (newAccessToken == null || newAccessToken.isEmpty) {
        throw Exception('새 인증정보를 불러오지 못했습니다.');
      }

      return _chatbotService.sendMessage(
        message: message,
        history: history,
        accessToken: newAccessToken,
      );
    }
  }

  Future<void> _sendMessage([String? preset]) async {
    final text = preset ?? _controller.text.trim();

    if (text.isEmpty || _isReplying) {
      return;
    }

    final history = _buildHistory();

    setState(() {
      _messages.add(_ChatMessage(text: text, isUser: true));
      _isReplying = true;
    });

    _controller.clear();
    _scrollToBottom();

    try {
      final answer = await _requestChatbotAnswer(
        message: text,
        history: history,
      );

      if (!mounted) return;

      setState(() {
        _messages.add(_ChatMessage(text: answer, isUser: false));
        _isReplying = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _messages.add(_ChatMessage(text: _getErrorMessage(e), isUser: false));
        _isReplying = false;
      });
    }

    _scrollToBottom();
  }

  List<Map<String, String>> _buildHistory() {
    final history = _messages
        .map(
          (message) => <String, String>{
            'role': message.isUser ? 'user' : 'assistant',
            'content': message.text,
          },
        )
        .toList();

    if (history.length > 20) {
      return history.sublist(history.length - 20);
    }

    return history;
  }

  String _getErrorMessage(Object error) {
    final message = error.toString().replaceFirst('Exception: ', '');

    if (message.contains('로그인 인증정보를 확인할 수 없습니다.')) {
      return '로그인 정보를 확인할 수 없어요.\n다시 로그인한 뒤 이용해주세요.';
    }

    if (message.contains('로그인 세션이 만료되었습니다.') ||
        message.contains('인증이 필요합니다.')) {
      return '로그인 세션이 만료되었어요.\n다시 로그인한 뒤 이용해주세요.';
    }

    if (message.contains('새 인증정보를 불러오지 못했습니다.')) {
      return '로그인 정보를 갱신하지 못했어요.\n다시 로그인해주세요.';
    }

    if (message.contains('AI 서비스에 연결할 수 없습니다.')) {
      return '현재 AI 서비스에 연결할 수 없어요.\n잠시 후 다시 시도해주세요.';
    }

    if (message.contains('AI 서비스가 아직 설정되지 않았습니다.')) {
      return '현재 AI 서비스 설정을 확인하고 있어요.\n백엔드 Genkit 설정을 확인해주세요.';
    }

    return '챗봇 답변을 불러오지 못했어요.\n$message';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF8FBFF),
      child: Column(
        children: [
          _buildHeader(),
          Expanded(child: _buildMessageList()),
          _buildRecommendedQuestions(),
          _buildInputArea(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE7F2FF)),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              color: Color(0xFFEAF6FF),
              shape: BoxShape.circle,
            ),
            child: ClipOval(
              child: Image.asset(
                'assets/images/AIchat숨이.png',
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '숨-잇 AI 챗봇',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF1E2F4D),
                  ),
                ),
                SizedBox(height: 5),
                Row(
                  children: [
                    _OnlineDot(),
                    SizedBox(width: 6),
                    Text(
                      '무엇이든 편하게 물어보세요',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF8A97A8),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: const Color(0xFFEAF6FF),
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Text(
              '안내',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xFF2F9BFF),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      itemCount: _messages.length + (_isReplying ? 1 : 0),
      itemBuilder: (context, index) {
        if (_isReplying && index == _messages.length) {
          return _buildTypingBubble();
        }

        return _buildMessageBubble(_messages[index]);
      },
    );
  }

  Widget _buildMessageBubble(_ChatMessage message) {
    if (message.isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 280),
          margin: const EdgeInsets.only(left: 60, bottom: 14),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xFF4DA8FF),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Text(
            message.text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(right: 40, bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              color: Color(0xFFEAF6FF),
              shape: BoxShape.circle,
            ),
            child: ClipOval(
              child: Image.asset(
                'assets/images/AIchat숨이.png',
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(6),
                  topRight: Radius.circular(18),
                  bottomLeft: Radius.circular(18),
                  bottomRight: Radius.circular(18),
                ),
                border: Border.all(color: const Color(0xFFE5F1FC)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x08000000),
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Text(
                message.text,
                style: const TextStyle(
                  color: Color(0xFF334155),
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTypingBubble() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              color: Color(0xFFEAF6FF),
              shape: BoxShape.circle,
            ),
            child: ClipOval(
              child: Image.asset(
                'assets/images/AIchat숨이.png',
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFE5F1FC)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _TypingDot(),
                SizedBox(width: 4),
                _TypingDot(),
                SizedBox(width: 4),
                _TypingDot(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecommendedQuestions() {
    final icons = [
      Icons.description_outlined,
      Icons.assignment_outlined,
      Icons.calendar_month_outlined,
      Icons.medication_outlined,
    ];

    return Container(
      color: const Color(0xFFF8FBFF),
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
      child: SizedBox(
        height: 42,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: _recommendedQuestions.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (context, index) {
            final question = _recommendedQuestions[index];

            return ActionChip(
              avatar: Icon(
                icons[index],
                size: 18,
                color: const Color(0xFF3C9DFF),
              ),
              side: const BorderSide(color: Color(0xFFCFE7FF)),
              backgroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              label: Text(
                question,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF334155),
                ),
              ),
              onPressed: _isReplying ? null : () => _sendMessage(question),
            );
          },
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFEAF2F8))),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF4F7FA),
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _controller,
                minLines: 1,
                maxLines: 4,
                enabled: !_isReplying,
                textInputAction: TextInputAction.send,
                decoration: const InputDecoration(
                  prefixIcon: Icon(
                    Icons.auto_awesome_rounded,
                    color: Color(0xFF4DA8FF),
                    size: 19,
                  ),
                  hintText: '궁금한 내용을 입력해주세요.',
                  hintStyle: TextStyle(
                    color: Color(0xFF9AA8B7),
                    fontSize: 14,
                  ),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(vertical: 12),
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _buildSendButton(),
        ],
      ),
    );
  }

  Widget _buildSendButton() {
    final disabled = _isReplying;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: disabled
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFD7E9F8), Color(0xFFBDD9EF)],
              )
            : const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF58B3FF), Color(0xFF2F80ED)],
              ),
        boxShadow: disabled
            ? const []
            : [
                BoxShadow(
                  color: const Color(0xFF2F80ED).withValues(alpha: 0.28),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 3,
                  offset: const Offset(0, 2),
                ),
              ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: disabled ? null : () => _sendMessage(),
          borderRadius: BorderRadius.circular(16),
          child: const Center(
            child: Icon(Icons.send_rounded, color: Colors.white, size: 21),
          ),
        ),
      ),
    );
  }
}

class _OnlineDot extends StatelessWidget {
  const _OnlineDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      decoration: const BoxDecoration(
        color: Color(0xFF59B98C),
        shape: BoxShape.circle,
      ),
    );
  }
}

class _TypingDot extends StatelessWidget {
  const _TypingDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 6,
      height: 6,
      decoration: const BoxDecoration(
        color: Color(0xFFAFA7B9),
        shape: BoxShape.circle,
      ),
    );
  }
}

class _ChatMessage {
  final String text;
  final bool isUser;

  const _ChatMessage({
    required this.text,
    required this.isUser,
  });
}