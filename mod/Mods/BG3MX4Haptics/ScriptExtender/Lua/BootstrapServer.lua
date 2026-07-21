local EventFile = "BG3Haptics/events.json"
local LastEventFile = "BG3Haptics/last-event.json"
local LastOsirisEventFile = "BG3Haptics/last-osiris-event.json"
local SessionId = tostring(Ext.Timer.ClockEpoch()) .. "-" .. tostring(Ext.Timer.MonotonicTime())
local Sequence = 0
local RecentEvents = {}
local RecentEventLimit = 16

local function IsPlayerControlled(characterGuid)
  if characterGuid == nil or characterGuid == "" then
    return false
  end

  local isPlayer = Osi.IsPlayer(characterGuid)
  return isPlayer == 1 or isPlayer == true
end

local function WriteSnapshot()
  Ext.IO.SaveFile(EventFile, Ext.Json.Stringify({
    version = 1,
    session = SessionId,
    sequence = Sequence,
    events = RecentEvents
  }))
end

local function TraceOsirisEvent(eventName, fields)
  local trace = fields or {}
  trace.event = eventName
  trace.host = Osi.GetHostCharacter()
  trace.timestamp = Ext.Timer.MonotonicTime()
  Ext.IO.SaveFile(LastOsirisEventFile, Ext.Json.Stringify(trace))
end

local function Emit(eventType, fields)
  Sequence = Sequence + 1

  local event = fields or {}
  event.id = SessionId .. ":" .. tostring(Sequence)
  event.type = eventType
  event.timestamp = Ext.Timer.MonotonicTime()

  Ext.IO.SaveFile(LastEventFile, Ext.Json.Stringify(event))

  table.insert(RecentEvents, event)
  while #RecentEvents > RecentEventLimit do
    table.remove(RecentEvents, 1)
  end

  WriteSnapshot()
end

Ext.Osiris.RegisterListener("TurnStarted", 1, "after", function(objectGuid)
  TraceOsirisEvent("TurnStarted", { objectGuid = objectGuid })
  if IsPlayerControlled(objectGuid) then
    Emit("turn.started")
  end
end)

Ext.Osiris.RegisterListener("UsingSpell", 5, "after", function(casterGuid, spell, spellType, spellElement, storyActionId)
  TraceOsirisEvent("UsingSpell", { casterGuid = casterGuid, spell = spell, storyActionId = storyActionId })
  if IsPlayerControlled(casterGuid) then
    Emit("action.confirmed", {
      spell = spell,
      spellType = spellType,
      spellElement = spellElement,
      storyActionId = storyActionId
    })
  end
end)

Ext.Osiris.RegisterListener("AttackedBy", 7, "after", function(defender, attackerOwner, attacker, damageType, damageAmount, damageCause, storyActionId)
  TraceOsirisEvent("AttackedBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, damageAmount = damageAmount, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("attack.hit", {
      magnitude = damageAmount,
      damageType = damageType,
      damageCause = damageCause,
      storyActionId = storyActionId
    })
  elseif IsPlayerControlled(defender) then
    Emit("damage.received", {
      magnitude = damageAmount,
      damageType = damageType,
      damageCause = damageCause,
      storyActionId = storyActionId
    })
  end
end)

Ext.Osiris.RegisterListener("CriticalHitBy", 4, "after", function(defender, attackerOwner, attacker, storyActionId)
  TraceOsirisEvent("CriticalHitBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("attack.critical", { storyActionId = storyActionId })
  end
end)

Ext.Osiris.RegisterListener("MissedBy", 4, "after", function(defender, attackerOwner, attacker, storyActionId)
  TraceOsirisEvent("MissedBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("attack.missed", { storyActionId = storyActionId })
  end
end)

Ext.Osiris.RegisterListener("KilledBy", 4, "after", function(defender, attackerOwner, attacker, storyActionId)
  TraceOsirisEvent("KilledBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("character.killed", { storyActionId = storyActionId })
  end
end)

Ext.Osiris.RegisterListener("RollResult", 6, "after", function(eventName, roller, rollSubject, resultType, isActiveRoll, criticality)
  TraceOsirisEvent("RollResult", { eventName = eventName, roller = roller, resultType = resultType, criticality = criticality })
  if IsPlayerControlled(roller) and resultType ~= 2 then
    Emit(resultType == 1 and "roll.success" or "roll.failure", {
      eventName = eventName,
      isActiveRoll = isActiveRoll,
      criticality = criticality
    })
  end
end)

Ext.Osiris.RegisterListener("DialogRollResult", 5, "after", function(character, success, dialog, isDetectThoughts, criticality)
  TraceOsirisEvent("DialogRollResult", { character = character, success = success, criticality = criticality })
  if IsPlayerControlled(character) then
    Emit(success == 1 and "roll.success" or "roll.failure", {
      dialog = dialog,
      isDetectThoughts = isDetectThoughts,
      criticality = criticality
    })
  end
end)

Ext.Events.SessionLoaded:Subscribe(function()
  SessionId = tostring(Ext.Timer.ClockEpoch()) .. "-" .. tostring(Ext.Timer.MonotonicTime())
  Sequence = 0
  RecentEvents = {}
  WriteSnapshot()
  Ext.Utils.Print("[BG3MX4Haptics] Event bridge ready: " .. EventFile)
end)
