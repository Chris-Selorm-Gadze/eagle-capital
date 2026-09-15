//+------------------------------------------------------------------+
//| DeltaEngineSignalBus.mq5                                         |
//| Writes master position changes to a JSONL signal bus for the     |
//| Delta Engine Python worker (sub-10ms detection vs polling).      |
//|                                                                  |
//| Install: attach to ANY chart on the MASTER account.              |
//| Enable Algo Trading. File output goes to:                        |
//|   Terminal/Common/Files/delta_engine/signals_<login>.jsonl     |
//+------------------------------------------------------------------+
#property copyright "Delta Engine"
#property version   "1.00"
#property strict

input int PollMs = 50;  // Position scan interval (ms)

string g_busDir = "delta_engine";
string g_busFile = "";
ulong  g_tickets[];
double g_sl[];
double g_tp[];
double g_vol[];
string g_sym[];
long   g_type[];

int OnInit()
  {
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   g_busFile = StringFormat("signals_%I64d.jsonl", login);
   EventSetMillisecondTimer(MathMax(10, PollMs));
   SnapshotPositions();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   DiffAndEmit();
  }

void SnapshotPositions()
  {
   int total = PositionsTotal();
   ArrayResize(g_tickets, total);
   ArrayResize(g_sl, total);
   ArrayResize(g_tp, total);
   ArrayResize(g_vol, total);
   ArrayResize(g_sym, total);
   ArrayResize(g_type, total);

   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      if(!PositionSelectByTicket(ticket))
         continue;
      g_tickets[i] = ticket;
      g_sl[i]      = PositionGetDouble(POSITION_SL);
      g_tp[i]      = PositionGetDouble(POSITION_TP);
      g_vol[i]     = PositionGetDouble(POSITION_VOLUME);
      g_sym[i]     = PositionGetString(POSITION_SYMBOL);
      g_type[i]    = PositionGetInteger(POSITION_TYPE);
     }
  }

int FindPrevIndex(ulong ticket)
  {
   for(int i = 0; i < ArraySize(g_tickets); i++)
      if(g_tickets[i] == ticket)
         return i;
   return -1;
  }

string SideFromType(long t)
  {
   return (t == POSITION_TYPE_BUY) ? "buy" : "sell";
  }

void Emit(string event, ulong ticket, string symbol, string side, double volume,
          double sl, double tp, double prevVol = 0)
  {
   string line = StringFormat(
      "{\"event\":\"%s\",\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\","
      "\"volume\":%.8f,\"sl\":%.8f,\"tp\":%.8f,\"ts\":%I64d",
      event, ticket, symbol, side, volume, sl, tp, (long)(GetMicrosecondCount() / 1000)
   );
   if(prevVol > 0)
      line += StringFormat(",\"previous_volume\":%.8f", prevVol);
   line += "}";

   int h = FileOpen(g_busDir + "/" + g_busFile,
                    FILE_WRITE | FILE_READ | FILE_TXT | FILE_COMMON | FILE_SHARE_READ);
   if(h == INVALID_HANDLE)
     {
      // Create directory by opening for append
      h = FileOpen(g_busDir + "/" + g_busFile,
                   FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_SHARE_READ);
     }
   if(h == INVALID_HANDLE)
      return;
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, line + "\n");
   FileClose(h);
  }

void DiffAndEmit()
  {
   ulong  curTickets[];
   double curSl[], curTp[], curVol[];
   string curSym[];
   long   curType[];

   int total = PositionsTotal();
   ArrayResize(curTickets, total);
   ArrayResize(curSl, total);
   ArrayResize(curTp, total);
   ArrayResize(curVol, total);
   ArrayResize(curSym, total);
   ArrayResize(curType, total);

   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      curTickets[i] = ticket;
      curSl[i]      = PositionGetDouble(POSITION_SL);
      curTp[i]      = PositionGetDouble(POSITION_TP);
      curVol[i]     = PositionGetDouble(POSITION_VOLUME);
      curSym[i]     = PositionGetString(POSITION_SYMBOL);
      curType[i]    = PositionGetInteger(POSITION_TYPE);

      int idx = FindPrevIndex(ticket);
      if(idx < 0)
        {
         Emit("open", ticket, curSym[i], SideFromType(curType[i]), curVol[i], curSl[i], curTp[i]);
        }
      else
        {
         bool slChanged = MathAbs(curSl[i] - g_sl[idx]) > 1e-9;
         bool tpChanged = MathAbs(curTp[i] - g_tp[idx]) > 1e-9;
         if(slChanged && tpChanged)
            Emit("sltp", ticket, curSym[i], SideFromType(curType[i]), curVol[i], curSl[i], curTp[i]);
         else if(slChanged)
            Emit("sl", ticket, curSym[i], SideFromType(curType[i]), curVol[i], curSl[i], curTp[i]);
         else if(tpChanged)
            Emit("tp", ticket, curSym[i], SideFromType(curType[i]), curVol[i], curSl[i], curTp[i]);
         else if(MathAbs(curVol[i] - g_vol[idx]) > 1e-9)
            Emit("volume", ticket, curSym[i], SideFromType(curType[i]), curVol[i], curSl[i], curTp[i], g_vol[idx]);
        }
     }

   // Closes
   for(int j = 0; j < ArraySize(g_tickets); j++)
     {
      if(g_tickets[j] == 0)
         continue;
      bool stillOpen = false;
      for(int k = 0; k < total; k++)
        {
         if(curTickets[k] == g_tickets[j])
           {
            stillOpen = true;
            break;
           }
        }
      if(!stillOpen)
         Emit("close", g_tickets[j], g_sym[j], SideFromType(g_type[j]), 0, 0, 0);
     }

   g_tickets = curTickets;
   g_sl      = curSl;
   g_tp      = curTp;
   g_vol     = curVol;
   g_sym     = curSym;
   g_type    = curType;
  }
