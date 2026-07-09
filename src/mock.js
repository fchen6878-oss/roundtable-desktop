/*
 * mock.js — 模拟模型层（无需任何 API key）
 * 用「人设 + 立场 + 领域 + 议题关键词」模板化生成差异化发言。
 * 真实接入大模型时，只需把 MockModel.generate 换成对应的 LLM 调用即可，
 * 输入/输出契约（role + ctx -> text）保持不变。
 */
(function () {
  'use strict';

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // 根据角色填写的「领域」文本，映射到对应的观点片段库
  // 顺序敏感：越具体/越易歧义的领域放越前面（首个命中即返回）
  const DOMAIN_MAP = [
    { kw: ['情感', '关系', '婚姻', '恋爱', '人际', '夫妻', '伴侣', '沟通', '亲密'], bank: 'relation' },
    { kw: ['教育', '学习', '学校', '培训', '孩子', '学生', '考试', '升学', '家长', '老师', '育儿', '青少年'], bank: 'edu' },
    { kw: ['健康', '医疗', '身体', '饮食', '健身', '睡眠', '心理', '养生', '运动'], bank: 'health' },
    { kw: ['投资', '理财', '股票', '基金', '房产', '财务', '保险', '资产', '金融', '钱', '攒', '房贷', '存款'], bank: 'finance' },
    { kw: ['产品', '设计', '体验', '需求', '交互', 'UI', 'PM', '原型'], bank: 'product' },
    { kw: ['营销', '品牌', '推广', '流量', '内容', '曝光', '公关', '渠道'], bank: 'marketing' },
    { kw: ['旅行', '美食', '宠物', '家居', '消费', '兴趣', '爱好', '周末', '娱乐', '穿搭', '生活'], bank: 'life' },
    { kw: ['安全', '合规', '风险', '隐私', '法务', '审计', '监管'], bank: 'sec' },
    { kw: ['职业', '个人发展', '招聘', '裁员', '成长', '组织', '管理', '晋升', '跳槽', '职场'], bank: 'career' },
    { kw: ['业务', '市场', '增长', '客户', '营收', '销售', '运营', '电商'], bank: 'biz' },
    { kw: ['技术', '工程', '架构', '代码', '研发', '开发', '性能', '运维', '算法', 'AI', '大模型', '数据', '软件', '系统', '程序'], bank: 'tech' }
  ];
  function domainBank(domain) {
    const d = domain || '';
    for (const m of DOMAIN_MAP) {
      if (m.kw.some(k => d.indexOf(k) >= 0)) return m.bank;
    }
    return 'general';
  }

  // 观点片段库：每个领域下分 支持/反对/反驳/补充 四组
  const BANKS = {
    tech: {
      pro: [
        '技术杠杆一旦用对，长期可维护性反而更高',
        '标准化组件能减少重复造轮子，让团队聚焦真正有壁垒的事'
      ],
      con: [
        '抽象层越多，黑箱越深，真出问题时调试成本指数级上升',
        '过度封装会牺牲灵活性，遇到非常规需求就束手无策'
      ],
      counter: [
        '我尊重技术洁癖，但「可维护性」不能成为拖慢业务的挡箭牌',
        '性能焦虑要有数据支撑，不能凭直觉否定新工具'
      ],
      add: [
        '关键是建立护栏，比如代码评审和一键回退机制',
        '技术上可以分层渐进，先在非核心链路试点'
      ]
    },
    biz: {
      pro: [
        '市场窗口不等人，交付速度本身就是竞争力',
        '业务侧要的是快速试错，慢一步可能就丢了客户'
      ],
      con: [
        '盲目追求速度会埋下返工和技术债务的坑',
        '没有质量的交付，后期补救成本远超前期节省'
      ],
      counter: [
        '速度当然重要，但烂摊子最后还是团队一起收拾',
        '业务目标要落地，必须和尊重客观规律取得平衡'
      ],
      add: ['建议设一个价值阈值，只对有明确回报的场景放行']
    },
    sec: {
      pro: [
        '在合规框架内，也能选出受监管认可的工具',
        '安全不是阻碍，而是选型时的一票否决项之外的硬约束'
      ],
      con: [
        '外部平台一旦出问题，数据和合规的主动权就不在我们手里',
        '黑箱服务最难审计，出事时连取证都困难'
      ],
      counter: [
        '信任不能替代验证，但也不能因噎废食全盘否定',
        '可以走私有化部署，把数据主权拿回来'
      ],
      add: ['必须做数据分级，核心数据绝不进第三方黑箱']
    },
    career: {
      pro: [
        '环境逼我们往上走，去做更值钱的设计和判断',
        '重复性工作被替代，反而释放人力做创造性事'
      ],
      con: [
        '黑箱会削弱底层掌控力，让人越来越难独立解决问题',
        '经验被稀释，越往后越容易被更便宜的方案替代'
      ],
      counter: [
        '趋势挡不住，但个人要主动补「驾驭工具」的能力',
        '担心被替代，不如把自己变成定义规则的人'
      ],
      add: ['组织要配套再培训，别让变化变成无声的淘汰']
    },
    product: {
      pro: [
        '好产品先解决真问题，再谈酷不酷',
        '减法比加法更难也更重要，少即是多'
      ],
      con: [
        '只盯着易用性会牺牲深度，专业用户要的是能力不是糖果',
        '过度简化会把复杂业务削成四不像'
      ],
      counter: [
        '易用和功能不是零和，关键在分层——新手简单、老手能深挖',
        '体验是结果不是装饰，脱离场景谈易用是本末倒置'
      ],
      add: ['建议用真实用户任务来验证，而不是内部拍脑袋']
    },
    marketing: {
      pro: [
        '酒香也怕巷子深，再好的东西没人知道就等于零',
        '品牌是长期复利，越早沉淀越便宜'
      ],
      con: [
        '流量焦虑容易让人乱投，烧钱买来的用户留不住',
        '过度营销会透支信任，口碑崩了很难补'
      ],
      counter: [
        '推广和好产品要双轮转，只投不打磨是空中楼阁',
        '别迷信爆款，可持续的增长才有意义'
      ],
      add: ['先把核心人群打透，再谈破圈']
    },
    edu: {
      pro: [
        '适合的才是最好的，名气不该凌驾于匹配度',
        '早期更重要的是保护和激发内驱力，而非抢跑'
      ],
      con: [
        '升学压力是现实，完全顺其自然可能错过关键窗口',
        '太佛系容易变成放任，孩子需要适度的推一把'
      ],
      counter: [
        '名校光环有，但把人生押在一条跑道上风险太高',
        '比学校更重要的是家庭能不能接住孩子的情绪'
      ],
      add: ['无论选哪条路，留好退路和试错空间最重要']
    },
    health: {
      pro: [
        '身体是底层资产，早睡和运动会放大所有其他努力',
        '预防远比治疗便宜，越早启动复利越大'
      ],
      con: [
        '健康焦虑会把人逼进过度检查和伪科学',
        '一味自律容易走极端，反而伤身又伤神'
      ],
      counter: [
        '养生不能替代看病，症状面前该就医就就医',
        '没有一种饮食适合所有人，跟风最危险'
      ],
      add: ['关键在可持续的小习惯，而不是三分钟热血']
    },
    finance: {
      pro: [
        '长期看权益资产能跑赢通胀，不配置才是真风险',
        '定投能摊平波动，普通人最省心的入场方式'
      ],
      con: [
        '市场周期谁也预测不了，重仓就是赌',
        '杠杆和刚需钱绝不能进高风险资产'
      ],
      counter: [
        '风险和收益同源，空仓同样在承担机会成本',
        '择时很难，但资产配置的纪律能救你'
      ],
      add: ['先留足应急金和安全垫，再谈增值']
    },
    relation: {
      pro: [
        '亲密关系里，被看见比被照顾更重要',
        '给彼此空间不是疏远，而是让关系有呼吸感'
      ],
      con: [
        '只讲空间容易变成冷暴力，回避解决不了问题',
        '过度黏合会吞掉彼此的独立性，久了互相窒息'
      ],
      counter: [
        '陪伴和质量不矛盾，缺了心意的陪也是各刷各的手机',
        '说开比冷战强，但沟通的语气决定结果是和解还是引爆'
      ],
      add: ['冲突不可怕，关键是吵完还能回到「我们」而不是「你vs我」']
    },
    life: {
      pro: [
        '生活需要一点随性的快乐，计划外也有惊喜',
        '把钱花在体验上，回忆比东西更保值'
      ],
      con: [
        '毫无规划地消费，月底的焦虑会反噬快乐',
        '跟风打卡大多是滤镜，热闹散了剩空虚'
      ],
      counter: [
        '精致和省钱不冲突，会过日子的人两头都占',
        '别人的生活方式再好，未必适合你的节奏'
      ],
      add: ['找到自己的节奏，比追赶潮流更舒服']
    },
    general: {
      pro: ['方向上我支持，关键在执行节奏', '利大于弊，值得推进'],
      con: ['风险不小，我建议缓一缓', '我持保留，证据还不够'],
      counter: ['我理解你的出发点，但前提可能不成立', '有道理，不过别忘了另一面的代价'],
      add: ['可以小步快跑，边做边看']
    }
  };

  // 议题关键词 -> 专属金句，让常见议题的讨论更「对味」
  const TOPIC_HINTS = {
    '无代码': ['无代码把搭建门槛打下来，业务同学自己就能跑通原型', '无代码平台的锁定效应很强，迁出来极其昂贵'],
    '低代码': ['低代码能加速交付，但边界要划清', '低代码平台的锁定效应很强，迁出来极其昂贵'],
    'AI': ['AI 能放大个人产能，但幻觉和失控必须管', 'AI 是杠杆，但支点放错地方会砸到自己'],
    '大模型': ['大模型赋能业务的前提是可控可审计', '大模型很香，但成本与合规是两道硬坎'],
    '远程': ['远程让协作跨时区，但异步沟通的隐性成本低估了', '远程反而更考验文档和信任基建'],
    '裁员': ['裁员省的是显性成本，丢的是组织记忆', '组织瘦身要配套知识沉淀，否则能力塌方'],
    '上云': ['上云换来弹性，但账单和厂商绑定是新约束', '云原生该上则上，稳态系统别为上云而上云'],
    '开源': ['开源能降本并掌控主动权', '开源的运维与安全风险常被低估'],
    '外包': ['外包能快速扩容，但核心能力不能外包', '外包省了人头，可能丢了手艺'],
    '升学': ['名校光环有，但把人生押在一条跑道上风险太高', '比学校更重要的是家庭能不能接住孩子的情绪'],
    '择校': ['适合的才是最好的，名气不该凌驾于匹配度', '早期更重要的是保护和激发内驱力'],
    '教育': ['抢跑不等于领先，内驱力才是长线资产', '比成绩更重要的是孩子愿不愿意和你说话'],
    '买房': ['房子是资产也是枷锁，月供会锁死你的选择权', '买房前先想清楚是为住还是为涨，两件事逻辑完全不同'],
    '房贷': ['杠杆放大收益也放大风险，断供的代价扛不住', '留足应急金再上车，别把现金流榨干'],
    '投资': ['长期看权益资产能跑赢通胀，不配置才是真风险', '定投能摊平波动，普通人最省心的入场方式'],
    '理财': ['先留足安全垫，再谈增值', '风险和收益同源，空仓同样在承担机会成本'],
    '健康': ['身体是底层资产，早睡和运动会放大所有其他努力', '预防远比治疗便宜，越早启动复利越大'],
    '健身': ['可持续的小习惯胜过三分钟热血', '没有一种训练适合所有人，跟风最危险'],
    '婚姻': ['亲密关系里，被看见比被照顾更重要', '冲突不可怕，关键是吵完还能回到「我们」'],
    '恋爱': ['给彼此空间不是疏远，而是让关系有呼吸感', '说开的语气决定结果是和解还是引爆'],
    '关系': ['陪伴和质量不矛盾，缺了心意的陪也是各刷各的手机', '沟通的语气决定结果是和解还是引爆'],
    '大城市': ['大城市给的是可能性和同频的人，但也给足了焦虑和房租', '闯一闯亏的可能是几年，不闯亏的可能是念想'],
    '回老家': ['安稳是稀缺资源，但回老家也可能困在熟人社会的评价里', '别把回老家浪漫化，也别把它当成退路'],
    '副业': ['副业是抗风险的缓冲，但也容易两头不讨好', '先验证再投入，别一上来就all in'],
    '创业': ['创业放大了你的长处也放大了短板', '现金流比梦想重要，活得久才能等到拐点'],
    '读书': ['读书是性价比最高的认知杠杆', '读得多不等于想得清，输出才算真吸收'],
    '旅行': ['把钱花在体验上，回忆比东西更保值', '旅行让人知道自己只是世界的一小块']
  };
  // 议题金句（同一角色内避免重复，保证开场/辩论不撞车）
  function topicHint(topic, role) {
    const keys = Object.keys(TOPIC_HINTS).filter(k => topic && topic.indexOf(k) >= 0);
    if (!keys.length) return '';
    const pool = [];
    keys.forEach(k => TOPIC_HINTS[k].forEach(h => pool.push(h)));
    const used = (role && role._usedHints) || [];
    let avail = pool.filter(h => used.indexOf(h) < 0);
    if (!avail.length) avail = pool;
    const h = pick(avail);
    if (role) { if (!role._usedHints) role._usedHints = []; role._usedHints.push(h); }
    return h;
  }

  // 性格语气库
  const PERSONA_FLAVOR = {
    '激进': ['我说话直，不绕弯子。', '别跟我谈情怀，看结果。'],
    '保守': ['稳妥起见，我倾向于多想一步。', '宁可慢一点，别留坑。'],
    '幽默': ['说人话，这事儿没那么玄乎。', '我先讲个段子再讲道理。'],
    '理性': ['我们用数据说话。', '先拆结构，再下结论。'],
    '温和': ['我尽量客观，但也理解各方难处。', '折中往往是最不坏的选择。']
  };
  function flavor(personality) {
    const p = personality || '';
    for (const k in PERSONA_FLAVOR) {
      if (p.indexOf(k) >= 0) return pick(PERSONA_FLAVOR[k]);
    }
    return '';
  }

  class MockModel {
    // 有效倾向：自由模式下取引擎自动分配的 freeLean；制式辩论取用户设置的 stance
    _lean(role) { return role.freeLean || role.stance || 'neutral'; }

    // 统一入口：role + ctx -> { text, stance, fallback }
    generate(role, ctx) {
      const move = ctx.move;
      let text, stance;
      if (move === 'open') text = this.opening(role, ctx.topic);
      else if (move === 'debate' || move === 'probe') text = this.debate(role, ctx);
      else if (move === 'vote') { const v = this.vote(role, ctx.topic); text = v.text; stance = v.stance; }
      else text = role.name + '：关于「' + ctx.topic + '」，我还在思考。';
      return { text: text, stance: stance, fallback: null };
    }

    opening(role, topic) {
      const bank = BANKS[domainBank(role.domain)];
      const hint = topicHint(topic, role);
      const lean = this._lean(role);
      let core;
      if (lean === 'pro') core = pick(bank.pro);
      else if (lean === 'con') core = pick(bank.con);
      else core = '这件事不能一刀切，我建议先小范围试点，用数据说话。';

      let s = '关于「' + topic + '」';
      if (lean === 'pro') {
        s += '，我旗帜鲜明地支持。作为' + (role.title || '从业者') + '，' + core + '。';
      } else if (lean === 'con') {
        s += '，我持保留甚至谨慎的态度。以' + (role.title || '从业者') + '的视角，' + core + '。';
      } else {
        s += '，我想辩证地看。' + (role.title || '从业者') + '的角度下，' + core;
      }
      if (hint) s += ' ' + hint;
      const f = flavor(role.personality);
      if (f) s += ' ' + f;
      return s;
    }

    debate(role, ctx) {
      const topic = ctx.topic;
      const lastSpeaker = ctx.lastSpeaker;
      const bank = BANKS[domainBank(role.domain)];
      const hint = topicHint(topic, role);
      // 导演指令驱动：角色针对导演指令做定向补充/回应（而非按正常辩论流程走）
      if (ctx.directorInstruction) {
        return this.directedResponse(role, ctx.directorInstruction, topic, bank, hint);
      }
      if (!lastSpeaker) return this.opening(role, topic);

      const lastLean = (lastSpeaker.freeLean || lastSpeaker.stance || 'neutral');
      const lean = this._lean(role);
      const opposes = lean !== lastLean && lean !== 'neutral' && lastLean !== 'neutral';

      let s;
      if (opposes) {
        s = lastSpeaker.name + '刚才说的有道理，但作为' + (role.title || '从业者') +
          '我必须指出：' + pick(bank.counter);
        if (hint) s += ' 再说了，' + hint;
        s += '。';
      } else {
        s = lastSpeaker.name + '说到了点子上，我顺着补一层：' + pick(bank.add) + '。';
      }
      const f = flavor(role.personality);
      if (f) s += ' ' + f;
      return s;
    }

    // 导演指令下的定向回复：角色"收到指令"后围绕要求展开补充
    directedResponse(role, instruction, topic, bank, hint) {
      const lean = this._lean(role);
      // 根据角色立场选择不同语气方向
      let core;
      if (instruction.indexOf('补充') >= 0 || instruction.indexOf('再说说') >= 0 || instruction.indexOf('再次') >= 0) {
        // 补充观点：用 add 库
        core = pick(bank.add || bank.pro || ['我补充一点：从我的视角来看，这件事需要更细致的执行方案。']);
      } else if (instruction.indexOf('反对') >= 0 || instruction.indexOf('质疑') >= 0 || instruction.indexOf('反驳') >= 0) {
        // 质疑/反驳：用 counter 库
        core = pick(bank.counter || bank.con);
      } else if (instruction.indexOf('支持') >= 0 || instruction.indexOf('赞同') >= 0) {
        // 支持：用 pro 库
        core = pick(bank.pro || bank.add);
      } else {
        // 通用导演指令：根据立场选库
        if (lean === 'pro') core = pick(bank.add || bank.pro);
        else if (lean === 'con') core = pick(bank.con || bank.counter);
        else core = pick(bank.add || ['关键在于执行细节和风险控制', '需要更多数据来支撑决策', '可以分阶段推进，边验证边调整']);
      }

      let s = '收到导演的指示，我就刚才的话题再补充一下我的看法。';
      s += '作为' + (role.title || '参与者') + '，';
      if (lean === 'pro') s += '我认为这个方向值得推进——' + core + '。';
      else if (lean === 'con') s += '我还是有些顾虑——' + core + '。';
      else s += '我想说——' + core + '。';

      if (hint) s += '另外，' + hint;
      const f = flavor(role.personality);
      if (f) s += ' ' + f;
      return s;
    }

    vote(role, topic) {
      const bank = BANKS[domainBank(role.domain)];
      const lean = this._lean(role);
      if (lean === 'pro') {
        return { text: '我投赞成票。前提是建立护栏——' + pick(bank.add) + '，这样推进才稳。', stance: 'pro' };
      }
      if (lean === 'con') {
        return { text: '我投反对票，至少现在不赞成。除非能解决：' + pick(bank.con) + '，否则风险不可接受。', stance: 'con' };
      }
      return { text: '我弃权，倾向先试点。用' + (role.title || '从业者') + '的视角看，证据够了再扩大。', stance: 'neutral' };
    }
  }

  const api = { MockModel: MockModel, domainBank: domainBank, topicHint: topicHint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.MockModel = MockModel;
})();
