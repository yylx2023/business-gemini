#!/usr/bin/env python3
"""
清理重复 team_id 的账号脚本

该脚本会：
1. 扫描数据库中所有账号
2. 找出具有重复 team_id 的账号
3. 保留每组重复账号中 Cookie 最完整的那个（优先保留有 secure_c_ses 的）
4. 删除其他重复账号
5. 同时更新内存中的 account_manager

使用方法：
    python cleanup_duplicate_accounts.py [--dry-run]

参数：
    --dry-run: 仅预览将要删除的账号，不实际删除
"""

import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# 添加项目根目录到路径
project_root = Path(__file__).parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


def get_account_score(account: dict) -> tuple:
    """
    计算账号的优先级分数，分数越高越应该保留
    
    优先级规则：
    1. 有 secure_c_ses（Cookie 有效）> 无 secure_c_ses
    2. available=True > available=False
    3. 有 tempmail_url（可刷新）> 无 tempmail_url
    4. 无 cookie_expired > 有 cookie_expired
    5. ID 更小（更早创建）> ID 更大
    
    返回元组用于比较，Python 会按元组元素顺序比较
    """
    secure_c_ses = account.get("secure_c_ses", "") or ""
    available = account.get("available", True)
    tempmail_url = account.get("tempmail_url", "") or ""
    cookie_expired = account.get("cookie_expired", False)
    account_id = account.get("id", 999999)  # 数据库 ID 或索引
    
    return (
        1 if secure_c_ses.strip() else 0,        # Cookie 是否存在
        1 if available else 0,                    # 是否可用
        1 if tempmail_url.strip() else 0,         # 是否可刷新
        0 if cookie_expired else 1,               # Cookie 是否未过期
        -account_id                                # ID 越小越优先（取负数）
    )


def cleanup_from_database(dry_run: bool = False):
    """从数据库清理重复的 team_id 账号"""
    try:
        from app.database import SessionLocal, Account
        
        db = SessionLocal()
        try:
            # 获取所有账号
            accounts = db.query(Account).order_by(Account.id).all()
            print(f"\n[扫描] 数据库中共有 {len(accounts)} 个账号")
            
            # 按 team_id 分组
            team_id_groups = defaultdict(list)
            for acc in accounts:
                team_id = (acc.team_id or "").strip()
                if team_id:  # 只处理有 team_id 的账号
                    team_id_groups[team_id].append({
                        "id": acc.id,
                        "team_id": acc.team_id,
                        "secure_c_ses": acc.secure_c_ses,
                        "available": acc.available,
                        "tempmail_url": acc.tempmail_url,
                        "tempmail_name": acc.tempmail_name,
                        "cookie_expired": False,  # 数据库没有这个字段
                    })
            
            # 找出重复的 team_id
            duplicates = {k: v for k, v in team_id_groups.items() if len(v) > 1}
            
            if not duplicates:
                print("\n[结果] 没有发现重复的 team_id，无需清理")
                return
            
            print(f"\n[发现] {len(duplicates)} 组重复的 team_id：")
            
            accounts_to_delete = []
            accounts_to_keep = []
            
            for team_id, accounts_list in duplicates.items():
                print(f"\n  team_id: {team_id}")
                print(f"    重复数量: {len(accounts_list)}")
                
                # 按优先级排序，分数最高的排在最前面
                accounts_list.sort(key=get_account_score, reverse=True)
                
                # 保留第一个（分数最高的）
                keep = accounts_list[0]
                delete = accounts_list[1:]
                
                accounts_to_keep.append(keep)
                accounts_to_delete.extend(delete)
                
                print(f"    保留: ID={keep['id']}, tempmail={keep.get('tempmail_name', 'N/A')}, "
                      f"available={keep['available']}, has_cookie={bool(keep.get('secure_c_ses'))}")
                for d in delete:
                    print(f"    删除: ID={d['id']}, tempmail={d.get('tempmail_name', 'N/A')}, "
                          f"available={d['available']}, has_cookie={bool(d.get('secure_c_ses'))}")
            
            print(f"\n[汇总]")
            print(f"  - 将保留: {len(accounts_to_keep)} 个账号")
            print(f"  - 将删除: {len(accounts_to_delete)} 个账号")
            
            if dry_run:
                print("\n[预览模式] 未实际删除，添加 --execute 参数执行删除")
                return
            
            # 确认删除
            confirm = input(f"\n确定要删除 {len(accounts_to_delete)} 个重复账号吗？(y/n): ").strip().lower()
            if confirm != 'y':
                print("[取消] 未执行删除操作")
                return
            
            # 执行删除
            deleted_count = 0
            for acc in accounts_to_delete:
                try:
                    db.query(Account).filter(Account.id == acc['id']).delete()
                    deleted_count += 1
                    print(f"  ✓ 已删除 ID={acc['id']}")
                except Exception as e:
                    print(f"  ✗ 删除 ID={acc['id']} 失败: {e}")
            
            db.commit()
            print(f"\n[完成] 成功删除 {deleted_count} 个重复账号")
            
            # 重新加载 account_manager
            try:
                from app.account_manager import account_manager
                account_manager.load_config()
                print("[刷新] 已重新加载账号管理器")
            except Exception as e:
                print(f"[警告] 重新加载账号管理器失败: {e}")
                print("        请手动重启服务以使更改生效")
            
        finally:
            db.close()
            
    except ImportError as e:
        print(f"[错误] 无法导入数据库模块: {e}")
        print("        请确保在项目根目录下运行此脚本")
        return
    except Exception as e:
        print(f"[错误] 清理失败: {e}")
        import traceback
        traceback.print_exc()


def cleanup_from_json(dry_run: bool = False):
    """从 JSON 配置文件清理重复的 team_id 账号（备用方案）"""
    config_file = project_root / "business_gemini_session.json"
    
    if not config_file.exists():
        print(f"[错误] 配置文件不存在: {config_file}")
        return
    
    import json
    
    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)
    
    accounts = config.get("accounts", [])
    print(f"\n[扫描] JSON 配置中共有 {len(accounts)} 个账号")
    
    # 按 team_id 分组
    team_id_groups = defaultdict(list)
    for idx, acc in enumerate(accounts):
        team_id = (acc.get("team_id") or "").strip()
        if team_id:
            acc_copy = acc.copy()
            acc_copy["id"] = idx  # 使用索引作为 ID
            team_id_groups[team_id].append(acc_copy)
    
    # 找出重复的 team_id
    duplicates = {k: v for k, v in team_id_groups.items() if len(v) > 1}
    
    if not duplicates:
        print("\n[结果] 没有发现重复的 team_id，无需清理")
        return
    
    print(f"\n[发现] {len(duplicates)} 组重复的 team_id")
    
    indices_to_delete = set()
    
    for team_id, accounts_list in duplicates.items():
        print(f"\n  team_id: {team_id}")
        
        # 按优先级排序
        accounts_list.sort(key=get_account_score, reverse=True)
        
        # 保留第一个，删除其余
        keep = accounts_list[0]
        delete = accounts_list[1:]
        
        print(f"    保留: 索引={keep['id']}, tempmail={keep.get('tempmail_name', 'N/A')}")
        for d in delete:
            print(f"    删除: 索引={d['id']}, tempmail={d.get('tempmail_name', 'N/A')}")
            indices_to_delete.add(d['id'])
    
    print(f"\n[汇总] 将删除 {len(indices_to_delete)} 个账号")
    
    if dry_run:
        print("\n[预览模式] 未实际删除")
        return
    
    confirm = input(f"\n确定要删除 {len(indices_to_delete)} 个重复账号吗？(y/n): ").strip().lower()
    if confirm != 'y':
        print("[取消] 未执行删除操作")
        return
    
    # 从后往前删除，避免索引变化
    new_accounts = [acc for idx, acc in enumerate(accounts) if idx not in indices_to_delete]
    
    # 备份原文件
    backup_file = config_file.with_suffix(f".backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    print(f"[备份] 已备份原配置到: {backup_file}")
    
    # 保存新配置
    config["accounts"] = new_accounts
    with open(config_file, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    
    print(f"\n[完成] 成功删除 {len(indices_to_delete)} 个重复账号")
    print(f"        剩余 {len(new_accounts)} 个账号")


def main():
    print("=" * 60)
    print("  清理重复 team_id 账号工具")
    print("=" * 60)
    
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    use_json = "--json" in sys.argv
    
    if dry_run:
        print("\n[模式] 预览模式（不会实际删除）")
    
    if use_json:
        print("\n[存储] 使用 JSON 配置文件")
        cleanup_from_json(dry_run)
    else:
        print("\n[存储] 使用数据库")
        cleanup_from_database(dry_run)


if __name__ == "__main__":
    main()

