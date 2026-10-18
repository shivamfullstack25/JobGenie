package com.jobgenie.userservice.profile;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * Reads and writes the master-profile YAML (see profile/master-profile.example.yaml). Parsing uses
 * SnakeYAML's SafeConstructor, so a hostile file cannot instantiate arbitrary classes, and input
 * is size-capped.
 */
public final class ProfileYaml {

  public static final int MAX_BYTES = 200 * 1024;

  /** One field read from a YAML file. */
  public static final class Entry {
    public final String field;
    public final Object value;
    public final Provenance claimedProvenance;
    public final Double confidence;

    Entry(String field, Object value, Provenance claimedProvenance, Double confidence) {
      this.field = field;
      this.value = value;
      this.claimedProvenance = claimedProvenance;
      this.confidence = confidence;
    }
  }

  public static final class Parsed {
    public final List<Entry> entries = new ArrayList<>();
    public final List<String> errors = new ArrayList<>();
  }

  private ProfileYaml() {}

  public static String export(int version, Map<String, Map<String, Object>> facts) {
    Map<String, Object> tree = new LinkedHashMap<>();
    for (String field : ProfileSchema.fields().keySet()) {
      Map<String, Object> fact = facts.get(field);
      if (fact == null) {
        fact = placeholder();
      }
      int dot = field.indexOf('.');
      if (dot < 0) {
        tree.put(field, fact);
      } else {
        @SuppressWarnings("unchecked")
        Map<String, Object> section =
            (Map<String, Object>)
                tree.computeIfAbsent(field.substring(0, dot), k -> new LinkedHashMap<String, Object>());
        section.put(field.substring(dot + 1), fact);
      }
    }
    Map<String, Object> root = new LinkedHashMap<>();
    root.put("schemaVersion", 1);
    root.put("profileVersion", version);
    root.put("exportedAt", LocalDateTime.now().toString());
    root.put("profile", tree);

    DumperOptions options = new DumperOptions();
    options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
    options.setPrettyFlow(true);
    return new Yaml(options).dump(root);
  }

  private static Map<String, Object> placeholder() {
    Map<String, Object> fact = new LinkedHashMap<>();
    fact.put("value", ProfileSchema.USER_INPUT_REQUIRED);
    fact.put("provenance", null);
    fact.put("source", null);
    fact.put("confidence", null);
    fact.put("lastUpdated", null);
    fact.put("verifiedByUser", false);
    return fact;
  }

  @SuppressWarnings("unchecked")
  public static Parsed parse(String text) {
    Parsed parsed = new Parsed();
    if (text == null || text.trim().isEmpty()) {
      parsed.errors.add("The file is empty");
      return parsed;
    }
    if (text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES) {
      parsed.errors.add("The file is larger than " + MAX_BYTES / 1024 + " KB");
      return parsed;
    }
    Object root;
    try {
      root = new Yaml(new SafeConstructor()).load(text);
    } catch (RuntimeException e) {
      parsed.errors.add("Not valid YAML: " + firstLine(e.getMessage()));
      return parsed;
    }
    if (!(root instanceof Map) || !(((Map<?, ?>) root).get("profile") instanceof Map)) {
      parsed.errors.add("Expected a top-level 'profile:' mapping");
      return parsed;
    }
    Map<String, Object> profile = (Map<String, Object>) ((Map<?, ?>) root).get("profile");
    for (Map.Entry<String, Object> top : profile.entrySet()) {
      String key = top.getKey();
      if (ProfileSchema.isKnown(key)) {
        add(parsed, key, top.getValue());
      } else if (top.getValue() instanceof Map) {
        for (Map.Entry<String, Object> child : ((Map<String, Object>) top.getValue()).entrySet()) {
          add(parsed, key + "." + child.getKey(), child.getValue());
        }
      } else {
        parsed.errors.add("Unknown profile field '" + key + "'");
      }
    }
    return parsed;
  }

  @SuppressWarnings("unchecked")
  private static void add(Parsed parsed, String field, Object raw) {
    if (!ProfileSchema.isKnown(field)) {
      parsed.errors.add("Unknown profile field '" + field + "'");
      return;
    }
    Object value = raw;
    Provenance claimed = null;
    Double confidence = null;
    // Either {value: ..., provenance: ...} (as exported) or just the bare value.
    if (raw instanceof Map && ((Map<String, Object>) raw).containsKey("value")) {
      Map<String, Object> fact = (Map<String, Object>) raw;
      value = fact.get("value");
      Object p = fact.get("provenance");
      if (p != null) {
        try {
          claimed = Provenance.valueOf(String.valueOf(p));
        } catch (IllegalArgumentException e) {
          parsed.errors.add("'" + field + "' has an unknown provenance '" + p + "'");
          return;
        }
      }
      if (fact.get("confidence") instanceof Number) {
        confidence = ((Number) fact.get("confidence")).doubleValue();
      }
    }
    String error = value == null ? null : ProfileSchema.validate(field, value);
    if (error != null) {
      parsed.errors.add(error);
      return;
    }
    // Unfilled (null, [], "", USER_INPUT_REQUIRED) means "not provided", not "set to empty".
    if (ProfileSchema.isMissing(value)) {
      return;
    }
    parsed.entries.add(new Entry(field, value, claimed, confidence));
  }

  private static String firstLine(String message) {
    if (message == null) {
      return "parse error";
    }
    int newline = message.indexOf('\n');
    return newline < 0 ? message : message.substring(0, newline);
  }
}
