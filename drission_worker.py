#!/usr/bin/env python3
"""
DrissionPage 浏览器自动化工作器
用于 Gemini Business 账号注册和 Cookie 刷新
"""

import re
import time
import random
from typing import Optional, Dict
from urllib.parse import urlparse, parse_qs

from DrissionPage import Chromium, ChromiumOptions

# 导入验证码获取函数
from app.tempmail_api import get_verification_code_from_api
from auto_login_with_email import extract_verification_code, save_to_config


class DrissionPageWorker:
    """使用 DrissionPage 进行浏览器操作的工作器"""

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

    def register_or_refresh(self, email: str, tempmail_url: str, account_idx: int, is_new: bool = True) -> bool:
        """注册新账号或刷新已有账号的 Cookie
        
        Args:
            email: 邮箱地址
            tempmail_url: 临时邮箱 URL
            account_idx: 账号索引
            is_new: 是否是新账号（True: 新注册，False: 刷新已有账号）
        """
        try:
            print(f"[{'注册' if is_new else '刷新'}] 正在打开登录页面...")
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
            print(f"[{'注册' if is_new else '刷新'}] 正在输入邮箱: {email}")
            input_success = False
            for selector in email_input_selectors:
                if self.safe_input(selector, email):
                    input_success = True
                    break

            if not input_success:
                raise Exception("无法输入邮箱")

            time.sleep(1)

            # 点击继续按钮
            print(f"[{'注册' if is_new else '刷新'}] 正在点击继续按钮...")
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
            print(f"[{'注册' if is_new else '刷新'}] 正在等待页面跳转到验证码输入页面...")
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
                            print(f"[{'注册' if is_new else '刷新'}] ✓ 验证码输入框已出现")
                            break
                    except:
                        pass
                if code_input_found:
                    break
                time.sleep(2)
                waited += 2
                if waited % 10 == 0:
                    print(f"[{'注册' if is_new else '刷新'}] 等待验证码输入框... ({waited}/{max_wait}秒)")

            if not code_input_found:
                raise Exception("等待验证码输入框超时")

            # 获取验证码（使用 API 方式）
            print(f"[{'注册' if is_new else '刷新'}] 正在等待验证码...")
            verification_code = get_verification_code_from_api(
                tempmail_url=tempmail_url,
                timeout=120,
                retry_mode=False,
                extract_code_func=extract_verification_code
            )

            if not verification_code:
                raise Exception("未收到验证码")

            print(f"[{'注册' if is_new else '刷新'}] ✓ 获取到验证码: {verification_code}")

            # 输入验证码
            print(f"[{'注册' if is_new else '刷新'}] 正在输入验证码...")
            input_success = False
            for selector in code_input_selectors:
                try:
                    ele = self.page.ele(selector, timeout=5)
                    if ele:
                        ele.clear()
                        time.sleep(0.3)
                        ele.input(verification_code)
                        time.sleep(0.5)
                        print(f"[{'注册' if is_new else '刷新'}] ✓ 验证码输入成功")
                        input_success = True
                        break
                except Exception as e:
                    print(f"[{'注册' if is_new else '刷新'}] 输入验证码尝试失败: {e}")
                    continue

            if not input_success:
                raise Exception("无法输入验证码")

            time.sleep(1)

            # 点击验证按钮
            print(f"[{'注册' if is_new else '刷新'}] 正在点击验证按钮...")
            if not self.click_verify_button():
                raise Exception("无法点击验证按钮")

            time.sleep(3)

            # 检查是否需要输入姓名（新账号需要，已注册账号不需要）
            print(f"[{'注册' if is_new else '刷新'}] 检查是否需要输入姓名...")
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
                    print(f"[{'注册' if is_new else '刷新'}] ✓ 账号已注册，直接跳转到主页")
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
                print(f"[{'注册' if is_new else '刷新'}] 正在输入姓名...")
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
                print(f"[{'注册' if is_new else '刷新'}] 正在点击同意按钮...")
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
                print(f"[{'注册' if is_new else '刷新'}] 正在等待页面跳转...")
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
                print(f"[{'注册' if is_new else '刷新'}] 等待页面跳转（可能是已注册账号）...")
                if not self.wait_for_url_pattern(target_pattern, timeout=60):
                    # 最后尝试直接提取 Cookie
                    print(f"[{'注册' if is_new else '刷新'}] 尝试直接提取 Cookie...")

            time.sleep(3)

            # 处理欢迎对话框
            self.handle_welcome_dialog()
            time.sleep(2)

            # 提取数据
            print(f"[{'注册' if is_new else '刷新'}] 正在提取 Cookie...")
            cookies_data = self.extract_cookies_and_data()

            if cookies_data:
                # 保存到配置
                # save_to_config 会根据 team_id 自动判断：
                # - 如果 team_id 已存在，则更新现有账号
                # - 如果 team_id 不存在，则创建新账号
                if is_new:
                    # 新账号：传递 None，让 save_to_config 根据 team_id 自动判断
                    save_to_config(
                        cookies_data,
                        account_index=None,
                        tempmail_name=email,
                        tempmail_url=tempmail_url
                    )
                else:
                    # 刷新已有账号：也传递 None，让 save_to_config 根据 team_id 自动判断
                    # 这样即使账号索引变化了，也能正确更新
                    save_to_config(
                        cookies_data,
                        account_index=None,
                        tempmail_name=email,
                        tempmail_url=tempmail_url
                    )

                print(f"[{'注册' if is_new else '刷新'}] ✓ {'注册' if is_new else '刷新'}成功!")
                return True
            else:
                raise Exception("未能获取完整数据")

        except Exception as e:
            print(f"[{'注册' if is_new else '刷新'}] ✗ {'注册' if is_new else '刷新'}失败: {e}")
            return False


def refresh_single_account_drission(account_idx: int, account: dict, headless: bool = True) -> bool:
    """使用 DrissionPage 刷新单个账号的 Cookie
    
    Args:
        account_idx: 账号索引
        account: 账号配置字典
        headless: 是否使用无头模式
    
    Returns:
        bool: 是否刷新成功
    """
    email = account.get("tempmail_name") or account.get("email", "")
    tempmail_url = account.get("tempmail_url", "")
    
    if not email or not tempmail_url:
        print(f"[刷新] ✗ 账号 {account_idx} 缺少邮箱或临时邮箱 URL")
        return False
    
    worker = DrissionPageWorker(headless=headless)
    
    try:
        if not worker.create_browser():
            print(f"[刷新] ✗ 创建浏览器失败")
            return False
        
        success = worker.register_or_refresh(email, tempmail_url, account_idx, is_new=False)
        return success
        
    except Exception as e:
        print(f"[刷新] ✗ 刷新账号 {account_idx} 出错: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        worker.close_browser()


def register_new_account_drission(email: str, tempmail_url: str, account_idx: int, headless: bool = True) -> bool:
    """使用 DrissionPage 注册新账号

    Args:
        email: 邮箱地址
        tempmail_url: 临时邮箱 URL
        account_idx: 账号索引
        headless: 是否使用无头模式

    Returns:
        bool: 是否注册成功
    """
    worker = DrissionPageWorker(headless=headless)

    try:
        if not worker.create_browser():
            print(f"[注册] ✗ 创建浏览器失败")
            return False

        success = worker.register_or_refresh(email, tempmail_url, account_idx, is_new=True)
        return success

    except Exception as e:
        print(f"[注册] ✗ 注册账号出错: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        worker.close_browser()


def refresh_expired_accounts_drission(headless: bool = True) -> tuple:
    """使用 DrissionPage 刷新所有过期账号的 Cookie

    Args:
        headless: 是否使用无头模式

    Returns:
        tuple: (成功数量, 失败数量)
    """
    from app.account_manager import account_manager

    success_count = 0
    fail_count = 0

    # 获取所有需要刷新的账号
    accounts_to_refresh = []
    with account_manager.lock:
        for idx, account in enumerate(account_manager.accounts):
            # 检查是否有临时邮箱信息
            tempmail_url = account.get("tempmail_url", "")
            email = account.get("tempmail_name") or account.get("email", "")

            if not tempmail_url or not email:
                continue

            # 检查是否过期（secure_c_ses 为空或账号不可用）
            secure_c_ses = account.get("secure_c_ses", "")
            available = account.get("available", True)

            if not secure_c_ses or not available:
                accounts_to_refresh.append({
                    "idx": idx,
                    "email": email,
                    "tempmail_url": tempmail_url,
                    "account": account
                })

    if not accounts_to_refresh:
        print("[批量刷新] 没有需要刷新的账号")
        return (0, 0)

    print(f"[批量刷新] 发现 {len(accounts_to_refresh)} 个需要刷新的账号")

    for item in accounts_to_refresh:
        idx = item["idx"]
        email = item["email"]
        tempmail_url = item["tempmail_url"]

        print(f"\n[批量刷新] 正在刷新账号 {idx}: {email}")

        success = refresh_single_account_drission(idx, item["account"], headless=headless)

        if success:
            success_count += 1
            print(f"[批量刷新] ✓ 账号 {idx} 刷新成功")
        else:
            fail_count += 1
            print(f"[批量刷新] ✗ 账号 {idx} 刷新失败")

    print(f"\n[批量刷新] 完成: 成功 {success_count}, 失败 {fail_count}")
    return (success_count, fail_count)

