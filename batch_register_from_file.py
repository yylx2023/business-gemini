#!/usr/bin/env python3
"""
批量注册脚本
从 txt 文件读取临时邮箱信息，自动执行 Gemini Business 注册流程

文件格式（每行）：
邮箱地址<tab>临时邮箱URL

示例：
01o3mkzs@3d-tech.top	https://tempmail.3d-tech.top/?jwt=eyJ...
"""

import argparse
import os
import sys
import time
from typing import List, Tuple

# 导入现有的自动登录功能
from auto_login_with_email import refresh_single_account


def parse_email_file(file_path: str) -> List[Tuple[str, str]]:
    """解析邮箱列表文件"""
    accounts = []
    
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
            
            accounts.append((email, tempmail_url))
    
    return accounts


def register_single_account(
    email: str,
    tempmail_url: str,
    account_idx: int,
    headless: bool = True,
    mode: str = "auto"
) -> bool:
    """注册单个账号"""
    print(f"\n{'='*60}")
    print(f"正在注册账号 [{account_idx}]: {email}")
    print(f"{'='*60}")
    
    account = {
        "email": email,
        "tempmail_url": tempmail_url,
        "tempmail_name": email,
    }
    
    try:
        # 使用大索引确保创建新账号而不是覆盖已有账号
        success = refresh_single_account(
            account_idx=99999 + account_idx,
            account=account,
            headless=headless,
            mode=mode
        )
        
        if success:
            print(f"[注册] ✓ 账号 {email} 注册成功!")
        else:
            print(f"[注册] ✗ 账号 {email} 注册失败")
        
        return success
        
    except Exception as e:
        print(f"[注册] ✗ 账号 {email} 注册出错: {e}")
        import traceback
        traceback.print_exc()
        return False


def batch_register(
    file_path: str,
    headless: bool = True,
    mode: str = "auto",
    start_index: int = 0,
    count: int = -1,
    delay: int = 5
) -> Tuple[int, int]:
    """批量注册账号"""
    accounts = parse_email_file(file_path)
    
    if not accounts:
        print("[错误] 未找到有效的账号信息")
        return 0, 0
    
    total = len(accounts)
    print(f"\n[信息] 共找到 {total} 个账号")
    
    if start_index >= total:
        print(f"[错误] 起始索引 {start_index} 超出范围（共 {total} 个账号）")
        return 0, 0
    
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
        else:
            fail_count += 1
        
        print(f"\n[统计] 当前进度: 成功 {success_count}, 失败 {fail_count}, 剩余 {len(to_process) - i - 1}")
        
        if i < len(to_process) - 1:
            print(f"[等待] 等待 {delay} 秒后继续...")
            time.sleep(delay)
    
    return success_count, fail_count


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
    
    args = parser.parse_args()
    
    if not os.path.exists(args.file):
        print(f"[错误] 文件不存在: {args.file}")
        sys.exit(1)
    
    print("="*60)
    print("Gemini Business 批量注册脚本")
    print("="*60)
    
    try:
        success, fail = batch_register(
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
        print(f"成功: {success}")
        print(f"失败: {fail}")
        print(f"总计: {success + fail}")
        
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

