local EventFile = "BG3Haptics/events.json"
local LastEventFile = "BG3Haptics/last-event.json"
local LastOsirisEventFile = "BG3Haptics/last-osiris-event.json"
local SessionId = tostring(Ext.Timer.ClockEpoch()) .. "-" .. tostring(Ext.Timer.MonotonicTime())
local Sequence = 0
local RecentEvents = {}
local RecentEventLimit = 64
local DebugTraces = false
local AreaSpellTypes = {
  cone = true,
  shout = true,
  storm = true,
  wall = true,
  zone = true
}

local function IsPlayerControlled(characterGuid)
  if characterGuid == nil or characterGuid == "" then
    return false
  end

  local isPlayer = Osi.IsPlayer(characterGuid)
  return isPlayer == 1 or isPlayer == true
end

local function HasSpellFlag(spell, flag)
  local ok, result = pcall(function()
    return Osi.SpellHasSpellFlag(spell, flag)
  end)
  return ok and (result == 1 or result == true)
end

local function GetSpellMetadata(spell, spellType)
  local areaRadius = 0
  local ok, result = pcall(function()
    local stats = Ext.Stats.Get(spell)
    return stats ~= nil and tonumber(stats.AreaRadius) or 0
  end)
  if ok and result ~= nil then
    areaRadius = result
  end

  local normalizedType = string.lower(tostring(spellType or ""))
  return {
    isOffensive = HasSpellFlag(spell, "IsSpell") and HasSpellFlag(spell, "IsHarmful"),
    isArea = areaRadius > 0 or AreaSpellTypes[normalizedType] == true,
    areaRadius = areaRadius
  }
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
  if not DebugTraces then
    return
  end

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

  if DebugTraces then
    Ext.IO.SaveFile(LastEventFile, Ext.Json.Stringify(event))
  end

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
  TraceOsirisEvent("UsingSpell", { casterGuid = casterGuid, spell = spell, spellType = spellType, storyActionId = storyActionId })
  if IsPlayerControlled(casterGuid) then
    local metadata = GetSpellMetadata(spell, spellType)
    if metadata.isOffensive then
      Emit("spell.offensive.started", {
        spell = spell,
        spellType = spellType,
        spellElement = spellElement,
        storyActionId = storyActionId,
        isArea = metadata.isArea,
        areaRadius = metadata.areaRadius
      })
    end
  end
end)

Ext.Osiris.RegisterListener("CastedSpell", 5, "after", function(casterGuid, spell, spellType, spellElement, storyActionId)
  TraceOsirisEvent("CastedSpell", { casterGuid = casterGuid, spell = spell, spellType = spellType, storyActionId = storyActionId })
  if IsPlayerControlled(casterGuid) then
    local metadata = GetSpellMetadata(spell, spellType)
    if metadata.isOffensive then
      Emit("spell.offensive.completed", {
        spell = spell,
        spellType = spellType,
        spellElement = spellElement,
        storyActionId = storyActionId,
        isArea = metadata.isArea,
        areaRadius = metadata.areaRadius
      })
    end
  end
end)

Ext.Osiris.RegisterListener("CastSpellFailed", 5, "after", function(casterGuid, spell, spellType, spellElement, storyActionId)
  TraceOsirisEvent("CastSpellFailed", { casterGuid = casterGuid, spell = spell, spellType = spellType, storyActionId = storyActionId })
  if IsPlayerControlled(casterGuid) then
    local metadata = GetSpellMetadata(spell, spellType)
    if metadata.isOffensive then
      Emit("spell.offensive.failed", {
        spell = spell,
        spellType = spellType,
        spellElement = spellElement,
        storyActionId = storyActionId
      })
    end
  end
end)

Ext.Osiris.RegisterListener("AttackedBy", 7, "after", function(defender, attackerOwner, attacker, damageType, damageAmount, damageCause, storyActionId)
  TraceOsirisEvent("AttackedBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, damageAmount = damageAmount, storyActionId = storyActionId })
  local magnitude = tonumber(damageAmount) or 0
  if magnitude > 0 and IsPlayerControlled(attackerOwner) then
    Emit("attack.hit", {
      magnitude = magnitude,
      damageType = damageType,
      damageCause = damageCause,
      storyActionId = storyActionId,
      direction = "dealt",
      attacker = attacker,
      target = defender
    })
  end
  if magnitude > 0 and IsPlayerControlled(defender) then
    Emit("damage.received", {
      magnitude = magnitude,
      damageType = damageType,
      damageCause = damageCause,
      storyActionId = storyActionId,
      direction = "received",
      attacker = attacker,
      target = defender
    })
  end
end)

Ext.Osiris.RegisterListener("CriticalHitBy", 4, "after", function(defender, attackerOwner, attacker, storyActionId)
  TraceOsirisEvent("CriticalHitBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("attack.critical", {
      storyActionId = storyActionId,
      direction = "dealt",
      attacker = attacker,
      target = defender
    })
  end
  if IsPlayerControlled(defender) then
    Emit("damage.received.critical", {
      storyActionId = storyActionId,
      direction = "received",
      attacker = attacker,
      target = defender
    })
  end
end)

Ext.Osiris.RegisterListener("MissedBy", 4, "after", function(defender, attackerOwner, attacker, storyActionId)
  TraceOsirisEvent("MissedBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("attack.missed", {
      storyActionId = storyActionId,
      direction = "dealt",
      attacker = attacker,
      target = defender
    })
  end
end)

Ext.Osiris.RegisterListener("KilledBy", 4, "after", function(defender, attackerOwner, attacker, storyActionId)
  TraceOsirisEvent("KilledBy", { defender = defender, attackerOwner = attackerOwner, attacker = attacker, storyActionId = storyActionId })
  if IsPlayerControlled(attackerOwner) then
    Emit("character.killed", {
      storyActionId = storyActionId,
      direction = "dealt",
      attacker = attacker,
      target = defender
    })
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
    Emit(success == 1 and "dialog.roll.success" or "dialog.roll.failure", {
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
