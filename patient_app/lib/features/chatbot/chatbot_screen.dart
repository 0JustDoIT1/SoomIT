import 'package:flutter/material.dart';

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

  bool _isReplying = false;

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

  void _sendMessage([String? preset]) {
    final text =
        preset ?? _controller.text.trim();

    if (text.isEmpty || _isReplying) {
      return;
    }

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

    final answer =
        _getTemporaryAnswer(text);

    Future.delayed(
      const Duration(
        milliseconds: 700,
      ),
      () {
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

        _scrollToBottom();
      },
    );
  }

  String _getTemporaryAnswer(
    String message,
  ) {
    final text =
        message.toLowerCase();

    if (text.contains('ct') &&
        (text.contains('준비') ||
            text.contains('검사'))) {
      return 'CT 검사 전 준비사항은 검사 종류와 '
          '조영제 사용 여부에 따라 달라질 수 있어요.\n\n'
          '예약된 검사 안내사항을 먼저 확인하고, '
          '금식 여부나 복용 중인 약은 병원의 안내를 따라주세요.';
    }

    if (text.contains('문진')) {
      return '문진표는 홈 화면의 「진료 전 문진」에서 '
          '작성할 수 있어요.\n\n'
          '작성 완료 전에는 임시저장과 수정이 가능하지만, '
          '작성 완료 후에는 수정할 수 없습니다.';
    }

    if (text.contains('예약')) {
      return '예약 메뉴에서 현재 예약 및 검사 일정을 '
          '확인할 수 있어요.\n\n'
          '예약 변경 또는 취소는 앱에서 요청할 수 있으며, '
          '최종 처리는 병원 확인 후 진행됩니다.';
    }

    if (text.contains('복약') ||
        text.contains('약')) {
      return '복약 메뉴에서 예정된 복약 일정을 확인하고, '
          '복용 후 「복용 완료」를 선택할 수 있어요.\n\n'
          '약의 변경이나 중단은 반드시 의료진과 상담해주세요.';
    }

    if (text.contains('호흡곤란') ||
        text.contains('객혈') ||
        text.contains('흉통')) {
      return '심한 호흡곤란, 객혈, 심한 흉통 등의 '
          '증상이 있다면 앱의 안내만으로 판단하지 말고 '
          '의료기관에 문의해주세요.\n\n'
          '숨-잇 챗봇은 진단이나 응급도 판단을 제공하지 않습니다.';
    }

    if (text.contains('폐암') &&
        (text.contains('확진') ||
            text.contains('진단'))) {
      return '숨-잇 챗봇은 폐암 확진이나 '
          '의료적 진단을 제공할 수 없어요.\n\n'
          '검사결과와 진단에 대해서는 '
          '담당 의료진의 설명을 확인해주세요.';
    }

    return '현재는 앱 사용방법, 검사 준비사항, '
        '일반 건강정보에 대한 안내를 도와드리고 있어요.\n\n'
        '궁금한 내용을 조금 더 구체적으로 질문해주세요.';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(
        0xFFFCFAFF,
      ),
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
      padding: const EdgeInsets.fromLTRB(
        18,
        16,
        18,
        14,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(
            color: Color(
              0xFFEEEAF4,
            ),
          ),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: const BoxDecoration(
              color: Color(
                0xFFEDE8FF,
              ),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.smart_toy_rounded,
              color: Color(
                0xFF6950B8,
              ),
              size: 24,
            ),
          ),

          const SizedBox(
            width: 12,
          ),

          const Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  '숨-잇 챗봇',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight:
                        FontWeight.w700,
                    color: Color(
                      0xFF292535,
                    ),
                  ),
                ),

                SizedBox(
                  height: 3,
                ),

                Row(
                  children: [
                    _OnlineDot(),

                    SizedBox(
                      width: 5,
                    ),

                    Text(
                      '무엇이든 편하게 물어보세요',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(
                          0xFF817A8D,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          Container(
            padding:
                const EdgeInsets.symmetric(
              horizontal: 10,
              vertical: 5,
            ),
            decoration: BoxDecoration(
              color: const Color(
                0xFFF3F0FA,
              ),
              borderRadius:
                  BorderRadius.circular(
                20,
              ),
            ),
            child: const Text(
              '안내',
              style: TextStyle(
                fontSize: 11,
                color: Color(
                  0xFF6950B8,
                ),
                fontWeight:
                    FontWeight.w600,
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
        alignment:
            Alignment.centerRight,
        child: Container(
          constraints:
              const BoxConstraints(
            maxWidth: 280,
          ),
          margin:
              const EdgeInsets.only(
            left: 60,
            bottom: 14,
          ),
          padding:
              const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            color: const Color(
              0xFF7460C8,
            ),
            borderRadius:
                BorderRadius.circular(
              18,
            ),
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
      padding:
          const EdgeInsets.only(
        right: 40,
        bottom: 14,
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration:
                const BoxDecoration(
              color: Color(
                0xFFEDE8FF,
              ),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.smart_toy_rounded,
              size: 17,
              color: Color(
                0xFF6950B8,
              ),
            ),
          ),

          const SizedBox(
            width: 8,
          ),

          Flexible(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(
                horizontal: 15,
                vertical: 12,
              ),
              decoration:
                  BoxDecoration(
                color: Colors.white,
                borderRadius:
                    const BorderRadius.only(
                  topLeft:
                      Radius.circular(6),
                  topRight:
                      Radius.circular(18),
                  bottomLeft:
                      Radius.circular(18),
                  bottomRight:
                      Radius.circular(18),
                ),
                border: Border.all(
                  color:
                      const Color(
                    0xFFF0EDF5,
                  ),
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(
                      0x0A000000,
                    ),
                    blurRadius: 10,
                    offset: Offset(
                      0,
                      3,
                    ),
                  ),
                ],
              ),
              child: Text(
                message.text,
                style: const TextStyle(
                  color: Color(
                    0xFF3A3642,
                  ),
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
      padding:
          const EdgeInsets.only(
        bottom: 14,
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration:
                const BoxDecoration(
              color: Color(
                0xFFEDE8FF,
              ),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.smart_toy_rounded,
              size: 17,
              color: Color(
                0xFF6950B8,
              ),
            ),
          ),

          const SizedBox(
            width: 8,
          ),

          Container(
            padding:
                const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
            decoration:
                BoxDecoration(
              color: Colors.white,
              borderRadius:
                  BorderRadius.circular(
                18,
              ),
            ),
            child: const Row(
              mainAxisSize:
                  MainAxisSize.min,
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
    return Container(
      color: const Color(
        0xFFFCFAFF,
      ),
      padding:
          const EdgeInsets.fromLTRB(
        12,
        4,
        12,
        8,
      ),
      child: SizedBox(
        height: 38,
        child: ListView.separated(
          scrollDirection:
              Axis.horizontal,
          itemCount:
              _recommendedQuestions
                  .length,
          separatorBuilder:
              (context, index) =>
                  const SizedBox(
            width: 7,
          ),
          itemBuilder: (
            context,
            index,
          ) {
            final question =
                _recommendedQuestions[
                    index];

            return ActionChip(
              side: const BorderSide(
                color: Color(
                  0xFFE1DAF2,
                ),
              ),
              backgroundColor:
                  Colors.white,
              label: Text(
                question,
                style:
                    const TextStyle(
                  fontSize: 12,
                  color: Color(
                    0xFF554A72,
                  ),
                ),
              ),
              onPressed: () {
                _sendMessage(
                  question,
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding:
          const EdgeInsets.fromLTRB(
        12,
        8,
        12,
        8,
      ),
      decoration:
          const BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(
            color: Color(
              0xFFF0ECF5,
            ),
          ),
        ),
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Container(
              decoration:
                  BoxDecoration(
                color: const Color(
                  0xFFF7F5FA,
                ),
                borderRadius:
                    BorderRadius.circular(
                  24,
                ),
              ),
              child: TextField(
                controller:
                    _controller,
                minLines: 1,
                maxLines: 4,
                textInputAction:
                    TextInputAction.send,
                decoration:
                    const InputDecoration(
                  hintText:
                      '궁금한 내용을 입력해주세요.',
                  hintStyle: TextStyle(
                    color: Color(
                      0xFFA59EAD,
                    ),
                    fontSize: 14,
                  ),
                  border:
                      InputBorder.none,
                  contentPadding:
                      EdgeInsets.symmetric(
                    horizontal: 17,
                    vertical: 12,
                  ),
                ),
                onSubmitted: (_) {
                  _sendMessage();
                },
              ),
            ),
          ),

          const SizedBox(
            width: 8,
          ),

          SizedBox(
            width: 44,
            height: 44,
            child: IconButton(
              onPressed:
                  _isReplying
                      ? null
                      : _sendMessage,
              style:
                  IconButton.styleFrom(
                backgroundColor:
                    const Color(
                  0xFF7460C8,
                ),
                foregroundColor:
                    Colors.white,
                disabledBackgroundColor:
                    const Color(
                  0xFFD5CFE5,
                ),
              ),
              icon: const Icon(
                Icons.arrow_upward_rounded,
                size: 22,
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