"""
Test Script: Detect positions and simulate state-diff polling.
Run this on your Windows machine to verify trade detection speed.
"""

import os
import sys
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from engine.mt5_connector import MT5Connector

def main():
    print("=== Delta Engine: Test Position Detection (State Diff) ===")
    
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

    print("\nStarting polling loop (press Ctrl+C to stop)...")
    
    known_tickets = set()
    
    try:
        # Initial state
        initial_positions = connector.get_open_positions()
        for pos in initial_positions:
            known_tickets.add(pos['ticket'])
        print(f"Tracking {len(known_tickets)} initial positions.")
        
        while True:
            current_positions = connector.get_open_positions()
            current_tickets = set(p['ticket'] for p in current_positions)
            
            # Find new tickets
            new_tickets = current_tickets - known_tickets
            if new_tickets:
                for t in new_tickets:
                    pos = next((p for p in current_positions if p['ticket'] == t), None)
                    print(f"[{time.strftime('%H:%M:%S')}] 🔥 NEW TRADE DETECTED: {pos['symbol']} | Ticket: {t} | Vol: {pos['volume']}")
            
            # Find closed tickets
            closed_tickets = known_tickets - current_tickets
            if closed_tickets:
                for t in closed_tickets:
                    print(f"[{time.strftime('%H:%M:%S')}] 🛑 TRADE CLOSED: Ticket {t}")
                    
            # Update known state
            known_tickets = current_tickets
            
            # Sleep 500ms (fast polling)
            time.sleep(0.5)
            
    except KeyboardInterrupt:
        print("\nPolling stopped by user.")
    finally:
        connector.shutdown()

if __name__ == "__main__":
    main()
