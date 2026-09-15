"""
Test Script: Place a demo market order.
Run this on your Windows machine to verify execution capability.
"""

import os
import sys
import MetaTrader5 as mt5

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from engine.mt5_connector import MT5Connector

def main():
    print("=== Delta Engine: Test Place Order ===")
    
    login_str = input("Enter MT5 Login: ")
    password = input("Enter MT5 Password: ")
    server = input("Enter MT5 Server Name: ")
    
    symbol = input("Enter Symbol (e.g., EURUSD): ") or "EURUSD"
    volume_str = input("Enter Volume (e.g., 0.01): ") or "0.01"
    side_str = input("Enter Side (buy/sell): ").lower() or "buy"
    
    try:
        login = int(login_str)
        volume = float(volume_str)
    except ValueError:
        print("Invalid number format.")
        return

    connector = MT5Connector(login=login, password=password, server=server)
    
    if not connector.initialize() or not connector.login_account():
        print("Setup failed.")
        return

    order_type = mt5.ORDER_TYPE_BUY if side_str == "buy" else mt5.ORDER_TYPE_SELL
    
    print(f"\nPlacing {side_str} order for {volume} lots on {symbol}...")
    result = connector.place_market_order(symbol=symbol, order_type=order_type, volume=volume)
    
    if result and result.get('retcode') == mt5.TRADE_RETCODE_DONE:
        print(f"SUCCESS! Ticket: {result.get('order')}, Price: {result.get('price')}")
    else:
        print("FAILED!")
        print(result)
        
    connector.shutdown()

if __name__ == "__main__":
    main()
