import 'package:flutter/material.dart';

import 'services/chatbot_service.dart';

class ChatbotScreen extends StatefulWidget {
  const ChatbotScreen({super.key});

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  final TextEditingController _controller =
      TextEditingController();

  final ScrollController _scrollController =
      ScrollController();

  final ChatbotService _chatbotService =
      ChatbotService();

  bool _isReplying = false;

  /*
   * 테스트용 JWT
   *
   * 지금은 로그인 기능을 구현하기 전이므로
   * Django shell에서 발급한 access token을
   * 임시로 넣어서 API 연결만 확인한다.
   *
   * 실제 로그인 구현 후에는 반드시 삭제할 것.
   */
  static const String _testAccessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzg5NDMzODIwLCJpYXQiOjE3ODk0MzM1MjAsImp0aSI6IjI2NTNlNTUyMTJiZTRjZGY5MzdhMTI2ZDc4YTcwZTE4IiwidXNlcl9pZCI6IjVlM2JiNTdkLTJmNzItNGMxNi1hZDU5LTY2MzdhZmY0MWUwOSJ9.MzBce0WOmf0VwQSgLIP1uWhuCXcEDh09HhL0Oaezspg';

  final List<_ChatMessage> _messages = [
    const _ChatMessage(
      text:
          '안녕하세요 😊\n'
          '숨-잇 안내 챗봇이에요.\n\n'
          '앱 사용방법, 검사 준비사항, '
          '일반 건강정보 등이 궁금하면 편하게 물어보세요.',
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
    WidgetsBinding.instance.addPostFrameCallback(
      (_) {
        if (!_scrollController.hasClients) {
          return;
        }

        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(
            milliseconds: 300,
          ),
          curve: Curves.easeOut,
        );
      },
    );
  }

  Future<void> _sendMessage([
    String? preset,
  ]) async {
    final text =
        preset ?? _controller.text.trim();

    if (text.isEmpty || _isReplying) {
      return;
    }

    /*
     * 현재 질문을 넣기 전의 대화 내용을
     * API history로 만든다.
     *
     * 서버 제한:
     * history 최대 20개
     */
    final history = _buildHistory();

    setState(() {
      _messages.add(
        _ChatMessage(
          text: text,
          isUser: true,
        ),
      );

      _isReplying = true;
    });

    _controller.clear();
    _scrollToBottom();

    try {
      if (_testAccessToken ==
          'PASTE_TEST_ACCESS_TOKEN_HERE') {
        throw Exception(
          '테스트용 JWT access token을 입력해주세요.',
        );
      }

      final answer =
          await _chatbotService.sendMessage(
        message: text,
        history: history,
        accessToken: _testAccessToken,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _messages.add(
          _ChatMessage(
            text: answer,
            isUser: false,
          ),
        );

        _isReplying = false;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }

      setState(() {
        _messages.add(
          _ChatMessage(
            text: _getErrorMessage(e),
            isUser: false,
          ),
        );

        _isReplying = false;
      });
    }

    _scrollToBottom();
  }

  List<Map<String, String>>
      _buildHistory() {
    final history = _messages
        .map(
          (message) =>
              <String, String>{
            'role': message.isUser
                ? 'user'
                : 'assistant',
            'content': message.text,
          },
        )
        .toList();

    /*
     * 서버에서 history 최대 20개까지만 허용.
     * 최근 대화 20개만 전달한다.
     */
    if (history.length > 20) {
      return history.sublist(
        history.length - 20,
      );
    }

    return history;
  }

  String _getErrorMessage(
    Object error,
  ) {
    final message =
        error.toString().replaceFirst(
              'Exception: ',
              '',
            );

    if (message.contains(
      '인증이 필요합니다.',
    )) {
      return '테스트 인증이 만료되었어요.\n'
          '새 access token을 발급한 뒤 다시 시도해주세요.';
    }

    if (message.contains(
      'AI 서비스에 연결할 수 없습니다.',
    )) {
      return '현재 AI 서비스에 연결할 수 없어요.\n'
          '잠시 후 다시 시도해주세요.';
    }

    if (message.contains(
      'AI 서비스가 아직 설정되지 않았습니다.',
    )) {
      return '현재 AI 서비스 설정을 확인하고 있어요.\n'
          '백엔드 Genkit 설정을 확인해주세요.';
    }

    if (message.contains(
      '테스트용 JWT',
    )) {
      return message;
    }

    return '챗봇 답변을 불러오지 못했어요.\n'
        '$message';
  }

@override
Widget build(BuildContext context) {
  return Material(
    color: const Color(0xFFF8FBFF),
    child: SafeArea(
      bottom: false,
      child: Column(
        children: [
          _buildHeader(),

          Expanded(
            child: _buildMessageList(),
          ),

          _buildRecommendedQuestions(),

          _buildInputArea(),
        ],
      ),
    ),
  );
}

Widget _buildHeader() {
  return Container(
    margin: const EdgeInsets.fromLTRB(16, 16, 16, 10),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(
        color: const Color(0xFFE7F2FF),
      ),
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
          padding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 7,
          ),
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
      padding:
          const EdgeInsets.fromLTRB(
        16,
        18,
        16,
        12,
      ),
      itemCount:
          _messages.length +
              (_isReplying ? 1 : 0),
      itemBuilder: (
        context,
        index,
      ) {
        if (_isReplying &&
            index ==
                _messages.length) {
          return _buildTypingBubble();
        }

        return _buildMessageBubble(
          _messages[index],
        );
      },
    );
  }

Widget _buildMessageBubble(
  _ChatMessage message,
) {
  if (message.isUser) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        constraints: const BoxConstraints(
          maxWidth: 280,
        ),
        margin: const EdgeInsets.only(
          left: 60,
          bottom: 14,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
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
    padding: const EdgeInsets.only(
      right: 40,
      bottom: 14,
    ),
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
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 13,
            ),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(6),
                topRight: Radius.circular(18),
                bottomLeft: Radius.circular(18),
                bottomRight: Radius.circular(18),
              ),
              border: Border.all(
                color: const Color(0xFFE5F1FC),
              ),
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
    padding: const EdgeInsets.only(
      bottom: 14,
    ),
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
          padding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: const Color(0xFFE5F1FC),
            ),
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
    padding: const EdgeInsets.fromLTRB(
      12,
      6,
      12,
      8,
    ),
    child: SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _recommendedQuestions.length,
        separatorBuilder: (_, _) =>
            const SizedBox(width: 8),
        itemBuilder: (
          context,
          index,
        ) {
          final question =
              _recommendedQuestions[index];

          return ActionChip(
            avatar: Icon(
              icons[index],
              size: 18,
              color: const Color(0xFF3C9DFF),
            ),
            side: const BorderSide(
              color: Color(0xFFCFE7FF),
            ),
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
            onPressed: _isReplying
                ? null
                : () {
                    _sendMessage(question);
                  },
          );
        },
      ),
    ),
  );
}

Widget _buildInputArea() {
  return Container(
    padding: const EdgeInsets.fromLTRB(
      12,
      8,
      12,
      10,
    ),
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(
        top: BorderSide(
          color: Color(0xFFEAF2F8),
        ),
      ),
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
                contentPadding: EdgeInsets.symmetric(
                  vertical: 12,
                ),
              ),
              onSubmitted: (_) {
                _sendMessage();
              },
            ),
          ),
        ),

        const SizedBox(width: 8),

        SizedBox(
          width: 46,
          height: 46,
          child: IconButton(
            onPressed:
                _isReplying ? null : _sendMessage,
            style: IconButton.styleFrom(
              backgroundColor:
                  const Color(0xFF4DA8FF),
              foregroundColor: Colors.white,
              disabledBackgroundColor:
                  const Color(0xFFBFDDF7),
            ),
            icon: const Icon(
              Icons.send_rounded,
              size: 21,
            ),
          ),
        ),
      ],
    ),
  );
}
}

class _OnlineDot
    extends StatelessWidget {
  const _OnlineDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7,
      height: 7,
      decoration:
          const BoxDecoration(
        color: Color(
          0xFF59B98C,
        ),
        shape: BoxShape.circle,
      ),
    );
  }
}

class _TypingDot
    extends StatelessWidget {
  const _TypingDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 6,
      height: 6,
      decoration:
          const BoxDecoration(
        color: Color(
          0xFFAFA7B9,
        ),
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