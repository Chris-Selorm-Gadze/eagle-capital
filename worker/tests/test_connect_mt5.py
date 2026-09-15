"""
Test Script: Connect to MT5 and fetch account info.
Run this on your Windows machine to verify MT5 Python integration works.
"""

import os
import sys
import json
from dotenv import load_dotenv

# Add parent dir to path so we can import engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from engine.mt5_connector import MT5Connector

def main():
    print("=== Delta Engine: Test MT5 Connection ===")
    
    # Load env vars from .env file or input
    load_dotenv()
    
    login_str = input("Enter MT5 Login (Account Number): ")
    password = input("Enter MT5 Password: ")
    server = input("Enter MT5 Server Name (e.g., MetaQuotes-Demo): ")
    
    try:
        login = int(login_str)
    except ValueError:
        print("Login must be an integer.")
        return

    connector = MT5Connector(login=login, password=password, server=server)
    
    print("\n[1] Initializing MT5...")
    if not connector.initialize():
        print("Failed to initialize MT5. Ensure terminal is installed.")
        return
        
    print("[2] Logging into account...")
    if not connector.login_account():
        print("Login failed. Check credentials and server.")
        connector.shutdown()
        return
        
    print("[3] Fetching account info...")
    account_info = connector.get_account_info()
    if account_info:
        print("\n--- Account Info ---")
        print(f"Login: {account_info.get('login')}")
        print(f"Name: {account_info.get('name')}")
        print(f"Server: {account_info.get('server')}")
        print(f"Balance: {account_info.get('balance')} {account_info.get('currency')}")
        print(f"Equity: {account_info.get('equity')} {account_info.get('currency')}")
        print(f"Leverage: 1:{account_info.get('leverage')}")
        print("--------------------\n")
    
    print("[4] Fetching open positions...")
    positions = connector.get_open_positions()
    print(f"Found {len(positions)} open positions.")
    for pos in positions:
        print(f"  - Ticket: {pos['ticket']}, Symbol: {pos['symbol']}, Type: {pos['type']}, Volume: {pos['volume']}, Profit: {pos['profit']}")
        
    print("\n[5] Shutting down...")
    connector.shutdown()
    print("Done.")

if __name__ == "__main__":
    main()
