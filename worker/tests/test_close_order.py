"""
Test Script: Close an open order.
Run this on your Windows machine to verify close execution capability.
"""

import os
import sys
import MetaTrader5 as mt5

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from engine.mt5_connector import MT5Connector

def main():
    print("=== Delta Engine: Test Close Order ===")
    
    login_str = input("Enter MT5 Login: ")
    password = input("Enter MT5 Password: ")
    server = input("Enter MT5 Server Name: ")
    
    try:
        login = int(login_str)
    except ValueError:
        print("Invalid number format.")
        return

    connector = MT5Connector(login=login, password=password, server=server)
    
    if not connector.initialize() or not connector.login_account():
        print("Setup failed.")
        return

    positions = connector.get_open_positions()
    if not positions:
        print("No open positions to close.")
        connector.shutdown()
        return
        
    print("\nOpen Positions:")
    for i, pos in enumerate(positions):
        print(f"[{i}] Ticket: {pos['ticket']} | {pos['symbol']} | Vol: {pos['volume']} | Profit: {pos['profit']}")
        
    choice_str = input("\nEnter index of position to close (or 'q' to quit): ")
    if choice_str.lower() == 'q':
        connector.shutdown()
        return
        
    try:
        choice = int(choice_str)
        target_ticket = positions[choice]['ticket']
    except (ValueError, IndexError):
        print("Invalid selection.")
        connector.shutdown()
        return
        
    print(f"\nAttempting to close ticket {target_ticket}...")
    result = connector.close_position(ticket=target_ticket)
    
    if result and result.get('retcode') == mt5.TRADE_RETCODE_DONE:
        print(f"SUCCESSFULLY CLOSED! Price: {result.get('price')}")
    else:
        print("FAILED TO CLOSE!")
        print(result)
        
    connector.shutdown()

if __name__ == "__main__":
    main()
