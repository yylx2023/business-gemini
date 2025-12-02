#!/usr/bin/env python3
"""
批量注册脚本
从 txt 文件读取临时邮箱信息，自动执行 Gemini Business 注册流程

文件格式（每行）：
邮箱地址<tab>临时邮箱URL

示例：
01o3mkzs@3d-tech.top	https://tempmail.3d-tech.top/?jwt=eyJ...

特性：
- 自动记录已成功注册的账号，下次运行时跳过
- 记录文件：<输入文件>.registered
- 使用 DrissionPage 进行浏览器操作（更稳定）
- 验证码获取使用 API 方式
"""

import argparse
import os
import re
import sys
import time
import random
from typing import List, Tuple, Set, Optional
from urllib.parse import urlparse, parse_qs
from datetime import datetime

from DrissionPage import Chromium, ChromiumOptions

# 导入验证码获取和保存功能
from auto_login_with_email import (
    extract_verification_code,
    save_to_config,
)
from app.tempmail_api import get_verification_code_from_api


def get_registered_file(input_file: str) -> str:
    """获取已注册记录文件路径"""
    return f"{input_file}.registered"


def load_registered_emails(input_file: str) -> Set[str]:
    """加载已注册成功的邮箱列表"""
    registered_file = get_registered_file(input_file)
    registered = set()

    if os.path.exists(registered_file):
        with open(registered_file, 'r', encoding='utf-8') as f:
            for line in f:
                email = line.strip()
                if email:
                    registered.add(email)

    return registered


def save_registered_email(input_file: str, email: str):
    """保存已注册成功的邮箱"""
    registered_file = get_registered_file(input_file)
    with open(registered_file, 'a', encoding='utf-8') as f:
        f.write(f"{email}\n")


def notify_new_account(account_idx: int, account_data: dict):
    """通知前端新账号已注册成功"""
    try:
        from app.account_manager import account_manager
        from app.websocket_manager import emit_account_update, emit_notification

        # 重新加载配置以获取最新账号
        account_manager.load_config()

        # 获取新账号的索引（最后一个账号）
        new_idx = len(account_manager.accounts) - 1
        if new_idx >= 0:
            new_account = account_manager.accounts[new_idx]
            # 推送 WebSocket 通知
            emit_account_update(new_idx, new_account)
            emit_notification("注册成功", f"账号 {account_data.get('email', new_idx)} 已注册", "success")
            print(f"[通知] ✓ 已通知前端新账号 {new_idx}")
        return True
    except Exception as e:
        # 静默失败，不影响注册流程
        pass
    return False


def parse_email_file(file_path: str, registered_emails: Set[str]) -> List[Tuple[str, str]]:
    """解析邮箱列表文件，过滤已注册的邮箱"""
    accounts = []
    skipped_count = 0

    if not os.path.exists(file_path):
        print(f"[错误] 文件不存在: {file_path}")
        return accounts

    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            parts = line.split('\t')
            if len(parts) != 2:
                print(f"[警告] 第 {line_num} 行格式错误，跳过: {line[:50]}...")
                continue

            email = parts[0].strip()
            tempmail_url = parts[1].strip()

            if '@' not in email:
                print(f"[警告] 第 {line_num} 行邮箱格式无效，跳过: {email}")
                continue

            if not tempmail_url.startswith('http'):
                print(f"[警告] 第 {line_num} 行 URL 格式无效，跳过: {tempmail_url[:50]}...")
                continue

            # 检查是否已注册
            if email in registered_emails:
                skipped_count += 1
                continue

            accounts.append((email, tempmail_url))

    if skipped_count > 0:
        print(f"[信息] 已跳过 {skipped_count} 个已注册的账号")

    return accounts


class DrissionPageWorker:
    """使用 DrissionPage 进行浏览器操作的注册器"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser: Optional[Chromium] = None
        self.page = None

    def create_browser(self) -> bool:
        """创建浏览器实例"""
        try:
            self.close_browser()

            options = ChromiumOptions().auto_port()

            # 设置 User-Agent
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
            options.set_user_agent(ua)

            if self.headless:
                options.set_argument('--headless=new')

            # 反检测参数
            options.set_argument('--disable-blink-features=AutomationControlled')
            options.set_argument('--no-sandbox')
            options.set_argument('--disable-dev-shm-usage')
            options.set_argument('--disable-gpu')
            options.set_argument('--lang=zh-CN')
            options.set_argument('--disable-web-security')
            options.set_argument('--window-size=1920,1080')

            options.set_pref('credentials_enable_service', False)
            options.set_pref('profile.password_manager_enabled', False)

            self.browser = Chromium(options)
            self.page = self.browser.latest_tab

            # 注入反检测脚本
            self._inject_fingerprint_script()

            return True

        except Exception as e:
            print(f"[浏览器] ✗ 创建浏览器失败: {e}")
            return False

    def _inject_fingerprint_script(self):
        """注入指纹混淆脚本"""
        script = '''
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
        window.chrome = { runtime: {} };
        '''
        try:
            self.page.run_js(script)
        except:
            pass

    def close_browser(self):
        """关闭浏览器"""
        if self.browser:
            try:
                self.browser.quit()
            except:
                pass
            finally:
                self.browser = None
                self.page = None

    def safe_input(self, selector: str, text: str, max_retries: int = 3) -> bool:
        """安全输入文本"""
        for attempt in range(max_retries):
            try:
                ele = self.page.ele(selector, timeout=10)
                if not ele:
                    continue

                ele.clear()
                time.sleep(0.3)
                clean_text = ''.join(c for c in text if ord(c) < 128)
                ele.input(clean_text)
                time.sleep(0.5)

                input_value = ele.attr('value') or ele.value
                if input_value and clean_text in input_value:
                    return True
                else:
                    ele.clear()
                    time.sleep(0.5)

            except Exception as e:
                print(f"[输入] 输入失败 (尝试 {attempt + 1}/{max_retries}): {e}")
                time.sleep(1)

        return False

    def wait_and_click(self, selector: str, timeout: float = 10) -> bool:
        """等待并点击元素"""
        try:
            ele = self.page.ele(selector, timeout=timeout)
            if ele:
                ele.click()
                return True
            return False
        except Exception as e:
            print(f"[点击] 点击失败: {e}")
            return False

    def wait_for_element(self, selector: str, timeout: float = 30) -> bool:
        """等待元素出现"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                ele = self.page.ele(selector, timeout=1)
                if ele:
                    return True
            except:
                pass
            time.sleep(0.5)
        return False

    def wait_for_url_pattern(self, pattern: str, timeout: float = 60) -> bool:
        """等待URL匹配模式"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                current_url = self.page.url
                if re.search(pattern, current_url):
                    return True
            except:
                pass
            time.sleep(1)
        return False

    def click_verify_button(self) -> bool:
        """点击验证按钮"""
        verify_selectors = [
            'xpath://button[@jsname="XooR8e"]',
            'xpath://button[@aria-label="验证"]',
            'xpath://button[contains(@class, "YUhpIc-LgbsSe") and @type="submit"]',
            'xpath://button[.//span[contains(text(), "验证")]]',
            'css:button[jsname="XooR8e"]',
            'css:button[aria-label="验证"]',
        ]

        for selector in verify_selectors:
            try:
                ele = self.page.ele(selector, timeout=3)
                if ele:
                    time.sleep(0.5)
                    ele.click()
                    print(f"[验证] ✓ 成功点击验证按钮")
                    return True
            except:
                continue

        # 尝试 JavaScript 方式
        try:
            js_code = '''
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.getAttribute('jsname') === 'XooR8e' ||
                    btn.getAttribute('aria-label') === '验证' ||
                    btn.innerText.includes('验证')) {
                    btn.click();
                    return true;
                }
            }
            return false;
            '''
            result = self.page.run_js(js_code)
            if result:
                print("[验证] ✓ 通过 JavaScript 成功点击验证按钮")
                return True
        except:
            pass

        return False

    def handle_welcome_dialog(self) -> bool:
        """处理欢迎对话框"""
        try:
            time.sleep(2)
            js_code = '''
            function clickWelcomeButton() {
                const app = document.querySelector('ucs-standalone-app');
                if (app && app.shadowRoot) {
                    const dialog = app.shadowRoot.querySelector('ucs-welcome-dialog');
                    if (dialog && dialog.shadowRoot) {
                        const btn = dialog.shadowRoot.querySelector('md-text-button');
                        if (btn) {
                            if (btn.shadowRoot) {
                                const innerBtn = btn.shadowRoot.querySelector('button');
                                if (innerBtn) { innerBtn.click(); return true; }
                            }
                            btn.click();
                            return true;
                        }
                    }
                }
                return false;
            }
            return clickWelcomeButton();
            '''
            result = self.page.run_js(js_code)
            return bool(result)
        except:
            return False

    def extract_cookies_and_data(self) -> Optional[dict]:
        """提取 Cookie 和数据"""
        try:
            cookies = self.page.cookies()
            c_oses = ""
            c_ses = ""

            for cookie in cookies:
                name = cookie.get('name', '')
                if name == '__Host-C_OSES':
                    c_oses = cookie.get('value', '')
                elif name == '__Secure-C_SES':
                    c_ses = cookie.get('value', '')

            current_url = self.page.url
            parsed = urlparse(current_url)
            query_params = parse_qs(parsed.query)
            csesidx = query_params.get('csesidx', [''])[0]

            config_id = ""
            path_match = re.search(r'/cid/([a-f0-9-]+)', parsed.path)
            if path_match:
                config_id = path_match.group(1)

            if c_ses and csesidx:
                return {
                    "secure_c_ses": c_ses,
                    "host_c_oses": c_oses,
                    "csesidx": csesidx,
                    "team_id": config_id,
                }

            return None

        except Exception as e:
            print(f"[提取] ✗ 提取数据失败: {e}")
            return None

    def register_account(self, email: str, tempmail_url: str, account_idx: int) -> bool:
        """注册账号"""
        try:
            print(f"[注册] 正在打开登录页面...")
            self.page.get('https://business.gemini.google')

            # 等待邮箱输入框
            email_input_selectors = [
                'xpath://input[@id="email-input"]',
                'xpath://input[@name="loginHint"]',
                '#email-input',
            ]

            email_input_found = False
            for selector in email_input_selectors:
                if self.wait_for_element(selector, timeout=30):
                    email_input_found = True
                    break

            if not email_input_found:
                raise Exception("等待邮箱输入框超时")

            time.sleep(1)

            # 输入邮箱
            print(f"[注册] 正在输入邮箱: {email}")
            input_success = False
            for selector in email_input_selectors:
                if self.safe_input(selector, email):
                    input_success = True
                    break

            if not input_success:
                raise Exception("无法输入邮箱")

            time.sleep(1)

            # 点击继续按钮
            print(f"[注册] 正在点击继续按钮...")
            continue_selectors = [
                'xpath://button[@id="log-in-button"]',
                'xpath://button[contains(@aria-label, "使用邮箱继续")]',
                '#log-in-button',
            ]

            clicked = False
            for selector in continue_selectors:
                if self.wait_and_click(selector, timeout=5):
                    clicked = True
                    break

            if not clicked:
                raise Exception("无法点击继续按钮")

            # 等待页面跳转到验证码输入页面
            print(f"[注册] 正在等待页面跳转到验证码输入页面...")
            code_input_selectors = [
                'xpath://input[@name="pinInput"]',
                'xpath://input[contains(@aria-label, "验证码")]',
                'input[name="pinInput"]',
            ]

            # 等待验证码输入框出现（最多60秒）
            code_input_found = False
            max_wait = 60
            waited = 0
            while waited < max_wait:
                for selector in code_input_selectors:
                    try:
                        ele = self.page.ele(selector, timeout=2)
                        if ele:
                            code_input_found = True
                            print(f"[注册] ✓ 验证码输入框已出现")
                            break
                    except:
                        pass
                if code_input_found:
                    break
                time.sleep(2)
                waited += 2
                if waited % 10 == 0:
                    print(f"[注册] 等待验证码输入框... ({waited}/{max_wait}秒)")

            if not code_input_found:
                raise Exception("等待验证码输入框超时")

            # 获取验证码（使用 API 方式）
            print(f"[注册] 正在等待验证码...")
            verification_code = get_verification_code_from_api(
                tempmail_url=tempmail_url,
                timeout=120,
                retry_mode=False,
                extract_code_func=extract_verification_code
            )

            if not verification_code:
                raise Exception("未收到验证码")

            print(f"[注册] ✓ 获取到验证码: {verification_code}")

            # 输入验证码
            print(f"[注册] 正在输入验证码...")
            input_success = False
            for selector in code_input_selectors:
                try:
                    ele = self.page.ele(selector, timeout=5)
                    if ele:
                        ele.clear()
                        time.sleep(0.3)
                        ele.input(verification_code)
                        time.sleep(0.5)
                        print(f"[注册] ✓ 验证码输入成功")
                        input_success = True
                        break
                except Exception as e:
                    print(f"[注册] 输入验证码尝试失败: {e}")
                    continue

            if not input_success:
                raise Exception("无法输入验证码")

            time.sleep(1)

            # 点击验证按钮
            print(f"[注册] 正在点击验证按钮...")
            if not self.click_verify_button():
                raise Exception("无法点击验证按钮")

            time.sleep(3)

            # 检查是否需要输入姓名（新账号需要，已注册账号不需要）
            print(f"[注册] 检查是否需要输入姓名...")
            name_selectors = [
                'xpath://input[@formcontrolname="fullName"]',
                'xpath://input[@placeholder="全名"]',
                'input[formcontrolname="fullName"]',
            ]

            # 同时检查姓名输入框和目标页面
            target_pattern = r'business\.gemini\.google/home/cid/[a-f0-9-]+\?csesidx=\d+'
            name_input_found = False
            already_logged_in = False

            # 等待最多15秒，看是姓名输入框出现还是直接跳转到主页
            max_wait = 15
            waited = 0
            while waited < max_wait:
                # 检查是否已经跳转到目标页面（已注册账号）
                current_url = self.page.url
                if re.search(target_pattern, current_url):
                    already_logged_in = True
                    print(f"[注册] ✓ 账号已注册，直接跳转到主页")
                    break

                # 检查姓名输入框
                for selector in name_selectors:
                    try:
                        ele = self.page.ele(selector, timeout=1)
                        if ele:
                            name_input_found = True
                            break
                    except:
                        pass

                if name_input_found:
                    break

                time.sleep(1)
                waited += 1

            # 如果找到姓名输入框，说明是新账号，需要完成注册流程
            if name_input_found and not already_logged_in:
                print(f"[注册] 正在输入姓名...")
                fullname = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz', k=5))

                input_success = False
                for selector in name_selectors:
                    if self.safe_input(selector, fullname):
                        input_success = True
                        break

                if not input_success:
                    raise Exception("无法输入姓名")

                time.sleep(1)

                # 点击同意按钮
                print(f"[注册] 正在点击同意按钮...")
                agree_selectors = [
                    'xpath://button[contains(@class, "agree-button")]',
                    'xpath://button[contains(., "同意并开始使用")]',
                    'xpath://button[contains(., "同意")]',
                    'button.agree-button',
                ]

                clicked = False
                for selector in agree_selectors:
                    if self.wait_and_click(selector, timeout=5):
                        clicked = True
                        break

                if not clicked:
                    raise Exception("无法点击同意按钮")

                # 等待页面跳转
                print(f"[注册] 正在等待页面跳转...")
                if not self.wait_for_url_pattern(target_pattern, timeout=90):
                    current_url = self.page.url
                    if '/admin/create' in current_url:
                        time.sleep(15)
                        if not self.wait_for_url_pattern(target_pattern, timeout=120):
                            raise Exception("页面跳转超时")
                    else:
                        raise Exception("页面跳转超时")

            elif not already_logged_in:
                # 既没有姓名输入框，也没有跳转到目标页面，尝试等待跳转
                print(f"[注册] 等待页面跳转（可能是已注册账号）...")
                if not self.wait_for_url_pattern(target_pattern, timeout=60):
                    # 最后尝试直接提取 Cookie
                    print(f"[注册] 尝试直接提取 Cookie...")

            time.sleep(3)

            # 处理欢迎对话框
            self.handle_welcome_dialog()
            time.sleep(2)

            # 提取数据
            print(f"[注册] 正在提取 Cookie...")
            cookies_data = self.extract_cookies_and_data()

            if cookies_data:
                # 保存到配置
                cookies_data["tempmail_url"] = tempmail_url
                cookies_data["tempmail_name"] = email

                save_to_config(
                    cookies_data,
                    account_index=99999 + account_idx,  # 大索引确保创建新账号
                    tempmail_url=tempmail_url,
                    tempmail_name=email
                )

                print(f"[注册] ✓ 注册成功!")
                return True
            else:
                raise Exception("未能获取完整数据")

        except Exception as e:
            print(f"[注册] ✗ 注册失败: {e}")
            return False


def register_single_account(
    email: str,
    tempmail_url: str,
    account_idx: int,
    headless: bool = True,
    mode: str = "auto"
) -> bool:
    """注册单个账号（使用 DrissionPage）"""
    print(f"\n{'='*60}")
    print(f"正在注册账号 [{account_idx}]: {email}")
    print(f"{'='*60}")

    worker = DrissionPageWorker(headless=headless)

    try:
        if not worker.create_browser():
            print(f"[注册] ✗ 创建浏览器失败")
            return False

        success = worker.register_account(email, tempmail_url, account_idx)

        if success:
            print(f"[注册] ✓ 账号 {email} 注册成功!")
            # 立即通知前端
            notify_new_account(account_idx, {"email": email})
        else:
            print(f"[注册] ✗ 账号 {email} 注册失败")

        return success

    except Exception as e:
        print(f"[注册] ✗ 账号 {email} 注册出错: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        worker.close_browser()


def batch_register(
    file_path: str,
    headless: bool = True,
    mode: str = "auto",
    start_index: int = 0,
    count: int = -1,
    delay: int = 5
) -> Tuple[int, int, int]:
    """批量注册账号

    Returns:
        Tuple[int, int, int]: (成功数, 失败数, 跳过数)
    """
    # 加载已注册的邮箱
    registered_emails = load_registered_emails(file_path)
    if registered_emails:
        print(f"[信息] 已有 {len(registered_emails)} 个账号之前注册成功，将被跳过")

    # 解析文件，过滤已注册邮箱
    accounts = parse_email_file(file_path, registered_emails)

    if not accounts:
        if registered_emails:
            print("[信息] 所有账号都已注册成功，无需再次注册")
        else:
            print("[错误] 未找到有效的账号信息")
        return 0, 0, len(registered_emails)

    total = len(accounts)
    print(f"\n[信息] 待注册账号: {total} 个")

    if start_index >= total:
        print(f"[错误] 起始索引 {start_index} 超出范围（共 {total} 个待注册账号）")
        return 0, 0, len(registered_emails)

    end_index = total if count < 0 else min(start_index + count, total)
    to_process = accounts[start_index:end_index]

    print(f"[信息] 将处理第 {start_index + 1} 到第 {end_index} 个账号，共 {len(to_process)} 个")
    print(f"[信息] 模式: {'无头' if headless else '可视化'}, 验证码方式: {mode}")
    print(f"[信息] 每个账号间隔: {delay} 秒")

    success_count = 0
    fail_count = 0

    for i, (email, tempmail_url) in enumerate(to_process):
        current_idx = start_index + i + 1

        print(f"\n[进度] 正在处理第 {current_idx}/{end_index} 个账号 ({i+1}/{len(to_process)})")

        success = register_single_account(
            email=email,
            tempmail_url=tempmail_url,
            account_idx=current_idx,
            headless=headless,
            mode=mode
        )

        if success:
            success_count += 1
            # 记录成功注册的邮箱
            save_registered_email(file_path, email)
        else:
            fail_count += 1

        print(f"\n[统计] 当前进度: 成功 {success_count}, 失败 {fail_count}, 剩余 {len(to_process) - i - 1}")

        if i < len(to_process) - 1:
            print(f"[等待] 等待 {delay} 秒后继续...")
            time.sleep(delay)

    return success_count, fail_count, len(registered_emails)


def main():
    parser = argparse.ArgumentParser(
        description="批量注册 Gemini Business 账号",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例用法：
  python batch_register_from_file.py email_access_urls.txt
  python batch_register_from_file.py email_access_urls.txt --visible
  python batch_register_from_file.py email_access_urls.txt --count 10
  python batch_register_from_file.py email_access_urls.txt --start 5 --count 10
  python batch_register_from_file.py email_access_urls.txt --mode browser
        """
    )
    
    parser.add_argument("file", help="包含邮箱和临时邮箱URL的txt文件路径")
    parser.add_argument("--visible", "-v", action="store_true", help="使用可视化模式")
    parser.add_argument("--mode", "-m", choices=["auto", "api", "browser"], default="auto",
                        help="验证码获取模式 (默认: auto)")
    parser.add_argument("--start", "-s", type=int, default=0, help="起始索引（从0开始）")
    parser.add_argument("--count", "-c", type=int, default=-1, help="要注册的数量（-1表示全部）")
    parser.add_argument("--delay", "-d", type=int, default=5, help="每个账号间隔秒数（默认: 5）")
    parser.add_argument("--reset", "-r", action="store_true", help="清除已注册记录，重新注册所有账号")

    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"[错误] 文件不存在: {args.file}")
        sys.exit(1)

    # 处理 --reset 参数
    if args.reset:
        registered_file = get_registered_file(args.file)
        if os.path.exists(registered_file):
            os.remove(registered_file)
            print(f"[信息] 已清除注册记录: {registered_file}")
        else:
            print(f"[信息] 无需清除，记录文件不存在")
    
    print("="*60)
    print("Gemini Business 批量注册脚本")
    print("="*60)
    
    try:
        success, fail, skipped = batch_register(
            file_path=args.file,
            headless=not args.visible,
            mode=args.mode,
            start_index=args.start,
            count=args.count,
            delay=args.delay
        )

        print("\n" + "="*60)
        print("注册完成!")
        print("="*60)
        print(f"本次成功: {success}")
        print(f"本次失败: {fail}")
        print(f"之前已成功: {skipped}")
        print(f"累计成功: {success + skipped}")

        # 显示记录文件位置
        registered_file = get_registered_file(args.file)
        print(f"\n[提示] 已注册记录保存在: {registered_file}")

        if fail > 0:
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n[中断] 用户取消操作")
        sys.exit(130)
    except Exception as e:
        print(f"\n[错误] 发生未预期的错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

