// ==UserScript==
// @name         闲鱼综合自动回复脚本（再次改进版）
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  监听闲鱼新消息、提取内容并自动回复（修复输入和发送问题）
// @match        https://www.goofish.com/im*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 将 log 函数移到全局作用域
    window.log = function(message) {
        console.log(`[闲鱼综合自动回复脚本] ${message}`);
    };

    const API_KEY = '0e1ec3fdad241a16189b54ef6de10e96.P951D07Cn2Cw7lIu';
    const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    let isReplying = false;
    let currentConversationId = null;
    let isProcessingMessage = false;
    let lastMessageCount = 0;

    async function waitForMessages() {
        log('等待消息加载...');
        for (let i = 0; i < 10; i++) {
            const messageRows = document.querySelectorAll('.message-row--a_0j1E_E');
            if (messageRows.length > 0) {
                log('消息已加载');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        log('等待消息加载超时');
        return false;
    }

    async function checkAndReplyNewMessages() {
        if (isReplying || isProcessingMessage) {
            log('正在处理或回复消息，跳过本次检查');
            return;
        }

        if (!(await waitForMessages())) {
            log('无法加载消息，跳过本次回复');
            return;
        }

        const messages = extractMessages();
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'user' && !isReplying) {
                log('检测到新的买家消息，准备回复');
                isProcessingMessage = true;
                isReplying = true;
                await autoReply(messages);
                await waitForMessageSent();
                isReplying = false;
                isProcessingMessage = false;
            }
        }
    }

    async function waitForMessageSent() {
        log('等待消息发送完成...');
        for (let i = 0; i < 10; i++) {
            const sendingIndicator = document.querySelector('.message-sending-indicator');
            if (!sendingIndicator) {
                log('消息已发送完成');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        log('等待消息发送超时');
        return false;
    }

    function getCurrentConversationId() {
        // 尝试从 URL 或页面元素中获取当前对话的唯一标识符
        // 这里需要根据闲鱼的具体实现来调整
        const conversationElement = document.querySelector('.conversation-id');
        return conversationElement ? conversationElement.dataset.id : null;
    }

    function observeNewMessages() {
        if (isObserving) {
            log('已经监新消息，无需重复启动');
            return true;
        }

        log('开始监控新消息...');
        const chatContainer = document.querySelector('div.message-list--tD5r4eck#message-list-scrollable');
        if (!chatContainer) {
            log('未找到聊天容器，无法监控新消息');
            return false;
        }

        const observer = new MutationObserver(async (mutations) => {
            for (let mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    await checkAndReplyNewMessages();
                    break;
                }
            }
        });

        observer.observe(chatContainer, { childList: true, subtree: true });
        isObserving = true;
        currentConversationId = getCurrentConversationId();
        log('新消息监控已成功启动，当前对话ID' + currentConversationId);

        // 立即检查一次，以防有未回复的消息
        checkAndReplyNewMessages();

        return true;
    }

    async function checkNewMessageBadge() {
        if (isReplying || isProcessingMessage) {
            log('正在处理或回复消息，跳过检查新消息角标');
            return false;
        }

        log('检查新消息角标...');
        const unreadBadge = document.querySelector('sup.ant-scroll-number.ant-badge-count.ant-badge-count-sm');

        if (unreadBadge) {
            log(`找到消息角标，内容为: ${unreadBadge.textContent}`);
            if (unreadBadge.textContent !== '0') {
                log('检测到新消息，尝试点击角标...');
                await clickBadge(unreadBadge);
                return true;
            } else {
                log('没有新消息。');
            }
        } else {
            log('未找到消息角标元素。');
        }
        return false;
    }

    async function clickBadge(badge) {
        let clickableElement = badge.closest('a') || badge.closest('button') || badge.parentElement;

        if (clickableElement) {
            log('找到可点击元素，模拟点击...');
            clickableElement.click();
            log('已模拟点击操作。');

            // 添加延迟后再检查和回复消息
            await new Promise(resolve => setTimeout(resolve, 2000));
            await checkAndReplyNewMessages();
        } else {
            log('未找到与角标关联的可点击元素。');
        }
    }

    function extractMessages() {
        log('开始提取消息内容...');
        const messageRows = document.querySelectorAll('.message-row--a_0j1E_E');
        const messages = [];

        messageRows.forEach((row, index) => {
            const messageContent = row.querySelector('.message-text--O0zh2EGA');
            if (messageContent) {
                const isOwnMessage = messageContent.classList.contains('message-text-right--zYtPHczJ');
                const content = messageContent.textContent.trim();
                const sender = isOwnMessage ? '' : '买家:';
                messages.push({
                    role: isOwnMessage ? 'assistant' : 'user',
                    content: `${sender} ${content}`
                });
            }
        });

        return messages;
    }

    function printMessages(messages) {
        log('提取到的消息内容：');
        messages.forEach(msg => {
            console.log(`${msg.index}. ${msg.sender}: ${msg.content}`);
        });
    }

    function sendMessage(message) {
        log('开始发送消息...');

        const textarea = document.querySelector('textarea.ant-input');
        if (!textarea) {
            log('未找到消息输入框');
            return;
        }

        // 聚焦输入框
        textarea.focus();

        // 使用 execCommand 插入文本
        document.execCommand('insertText', false, message);

        // 触发 input 事件
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        textarea.dispatchEvent(inputEvent);

        // 等待一小段时间，让文本有时间插入
        setTimeout(() => {
            // 模拟按下 Enter 键
            const enterKeyEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                keyCode: 13,
                which: 13,
                key: 'Enter'
            });
            textarea.dispatchEvent(enterKeyEvent);

            log('已尝试发送消息: ' + message);
        }, 500);
    }

    async function getGPTReply(messages) {
        log('调用 GPT 接口获取回复...');
        const systemMessage = {
            role: "system",
            content: "你是一个北京科技馆的买票助手，请以友好、专业的态度回答买家的问题。并且要跟正常人一样回复，" +
                "不允许回复的消息太长, 你需要保证回复的内容是一个正常人的内容。首先我们需要确定具体的人数，几个大人几个小孩，再确定具体的人数，"+
                "我们目前的服务价格是在每一个票上面加 15 元的服务费，没有其它的费用。需要的话直接拍，我们来改价格，长时间没改价格，请给 15099443576 打电话" +
                "科技馆的一些基础信息 开放时间：星期二至星期日9:30—17:00 主展厅 普通票： 30元/人/场 优惠票： 20元/人/场 免费票：0元/人/场 主展厅优惠票： 未满18周岁的未成年人和全日制大学本科及以下学历学生（不含成人教育及研究生）。 主展厅免费票： 8周岁（含）以下儿童或身高1.3米（含）以下有成人陪同的儿童（1名成人限携3名儿童免费）、60周岁(含)以上老人。 \n  儿童科学乐园普通票： 30元/人/场，不分大小孩子 \n 特效影院普通票： 30元/人/场  优惠票： 20元/人/场 未满18周岁的未成年人和全日制大学本科及以下学历学生（不含成人教育及研究生）。"
        };
        const allMessages = [systemMessage, ...messages];
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'GLM-4-Flash',
                messages: allMessages
            })
        });

        const data = await response.json();
        const reply = data.choices[0].message.content;
        log('GPT 回复: ' + reply);
        return reply;
    }

    async function autoReply(messages) {
        const reply = await getGPTReply(messages);
        sendMessage(reply);
    }

    let isObserving = false;

    async function main() {
        log('脚本已启动');

        while (true) {
            log('开始新的检查循环');

            if (isReplying || isProcessingMessage) {
                log('正在处理或回复消息，等待5秒后继续循环');
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }

            const conversationOpen = document.getElementById('message-list-scrollable');
            if (conversationOpen) {
                log('检测到打开的对话框');
                await checkNewMessagesInCurrentConversation();

                if (!isReplying && !isProcessingMessage) {
                    log('当前对话没有新消息，检查其他对话的红点');
                    await checkNewMessageBadge();
                }
            } else {
                log('当前没有打开的对话框，检查新消息红点');
                await checkNewMessageBadge();
            }

            log('等待3秒后继续下一次循环');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    async function checkNewMessagesInCurrentConversation() {
        if (!(await waitForMessages())) {
            log('无法加载消息，跳过本次检查');
            return;
        }

        const messages = extractMessages();
        if (messages.length > lastMessageCount) {
            log('检测到新消息');
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'user' && !isReplying) {
                log('检测到新的买家消息，准备回复');
                isProcessingMessage = true;
                isReplying = true;
                await autoReply(messages);
                await waitForMessageSent();
                isReplying = false;
                isProcessingMessage = false;
            }
            lastMessageCount = messages.length;
        } else {
            log('没有检测到新消息');
        }
    }

    // 使用多种方式尝试启动脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

    // 额外的安全措施：如果 DOMContentLoaded 已经触发但脚本没有启动，则在短暂延迟后尝试启
    setTimeout(() => {
        if (!window.scriptStarted) {
            log('DOMContentLoaded 可能已过，正在尝试启动脚本...');
            main();
        }
    }, 1000);

})();
