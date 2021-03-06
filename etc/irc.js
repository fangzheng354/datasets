/*

	Experimaestro javascript code
	see http://experimaestro.sf.net

*/

var irc_dir = xpm.get_script_file().get_ancestor(2);
var logger = xpm.logger("net.bpiwowar.irc");

logger.info("IR collections directory is %s", irc_dir);

var irc_bin = irc_dir.path("bin", "ircollections");

var irc = new Namespace("net.bpiwowar.irc")

xpm.set_property("namespace", irc);



var module_irc = {
	name: "Information Retrieval Collections",
	url: "http://ircollections.sourceforge.net",
	id: qname(irc, "main"),

	description: "<p>This contains the task associated with the IR collections project, which aims at providing an unique interface for running ad-hoc IR experiments.</p>"
};

module = xpm.add_module(module_irc);


// --- Get a task XML definition

function get_task(p) {
    logger.info("IR task is [%s], restriction [%s]", $(p.id), $(p.restrict));

    // Retrieve from cache
    var cache_id = irc("get-task").toString();
    var cache_key = { path: irc_dir.uri(), command: $(p.command), id: $(p.id), restrict: $(p.restrict), engine: $(p.engine) };
    var json = cache(cache_id, cache_key);
    if (json) {
        logger.debug("Using value from cache")
        return json;
    }

	args= [irc_bin, $(p.command), "--engine", $(p.engine)];
	if ($(p.restrict))
		args = args.concat("--restrict", $(p.restrict));

	// Run ircollections
	var command = args.concat($(p.id));

	logger.debug("arguments are %s", command.toString());

    // Get the output
	output = xpm.evaluate(command);
    logger.debug("Output is: %s", output);

    json = JSON.parse(output.trim());
    logger.debug("Caching IRC output");
    cache(cache_id, cache_key, json, 7 * 24 * 3600); // 1 week cache

	return json;
}

tasks.add("irc:get-task", {
    module: module_irc.id,

	// The description of this experiment
	description: "<p>Get the full description of an IR collection, including the list of files, the topics, and the qrels</p>",

    inputs: {
        command: { value: "string", "default": "prepare"},
        id: { value: "string", help: "The name of the IR task (e.g. trec.7/adhoc)" },
        restrict: { value: "string", help: "Restrict to a subcollection", optional: true },
        engine: { value: "string", help: "Transformation engine to use (none, indri)", default: "none" }
    },

    output: qname(irc, "task"),

    run: get_task
});




/**
 * Evaluate a run : hypotheses about evaluation are the same than
 * for adhoc runs - there are topics, evaluation metrics, a run file
 * and an assessmentr file
 */
var task_evaluate = {
	id: qname(irc, "evaluate"),

    module: module_irc.id,

	description: "<p>Evaluate a run</p>",

	inputs: {
	    "run": { json: "irc:run", help: "The path to the run file to evaluate" },
        "qrels": { json: "irc:qrels", help: "The relevance assessments" },
        "details": { json: "boolean", help: "Whether details results should be returned (query level)" },
        "out": { value: "file", help: "The output file", optional: true }
    },

	run: function(p) {
	   var outputPath = $(p.out) ? $(p.out) : $(p.run.path).add_extension(".eval");
       logger.info("Output path: %s [%s]", outputPath, $$(p.run));
		var command = [path(irc_bin), "evaluate"];
        if ($(p.details)) {
            command.push("--details");
        }
        command.push($(p.run.path), new JsonParameterFile("qrels", p.qrels));

		var rsrc = xpm.command_line_job(outputPath, command,
			{
				lock: get_locks(p),
				stdout: outputPath,
			}
		);

		// Run the evaluation
		var r = {
            $type: "irc:evaluation",
            $resource: rsrc,
		    path: outputPath,
            run: p.run,
            qrels: p.qrels
		}

		return r;
	}
};


xpm.add_task_factory(task_evaluate);



/**
 * Evaluate a set of runs
 */
var task_evaluate = {
    id: qname(irc, "evaluate-runs"),

    module: module_irc.id,

    description: "<p>Evaluate a series of runs</p>",

    inputs: {
        "runs": { array: "irc:run", help: "The runs to evaluate" },
        "qrels": { json: "irc:qrels", help: "The relevance assessments" },
        "details": { json: "boolean", help: "Whether details results should be returned (query level)" },
        "basedir": { json: "path", optional: true, help: "The directory in which the task should be created"},
        "$extension": { json: "string", default: ".eval" }
    },

    run: function(p) {
        var taskpath = $(p.basedir) ? this.unique_file($(p.basedir), "irc.evaluate", p) :  this.unique_file("irc.evaluate", p);
        var command = [path(irc_bin), "evaluate-runs"];
        if ($(p.details)) {
            command.push("--details");
        }
        command.push(p.runs.as_parameter_file("runs"), new ParameterFile("qrels", p.qrels.toSource()));
        var rsrc = xpm.command_line_job(taskpath, command, { lock: get_locks("READ", p) });

        // Run the evaluation
        var result = [];
        for(var i = 0; i < p.runs.length; i++) {
            result.push({
                $type: "irc:evaluation",
                $resource: rsrc,
                path: $(p.runs[i].path).add_extension($(p.$extension)),
                run: p.runs[i],
                qrels: p.qrels
            });
        }

        return result;
    }
};


xpm.add_task_factory(task_evaluate);

/**
 * Evaluate a run : hypotheses about evaluation are the same than
 * for adhoc runs - there are topics, evaluation metrics, a run file
 * and an assessmentr file
 */
tasks.add("irc:get-topics", {
    module: module_irc.id,
    inputs: {
        "topics": { json: "irc:topics", help: "The topics", copy: true },
        "format": { value: "string", help: "The output format", copy: "$format" },
    },

    run: function(p) {
        var command = [path(irc_bin), "get-topics", "--format", $(p.format), new ParameterFile("topics", p.topics.toSource())];

        var output = xpm.evaluate(command);

        return {
            $type: "irc:topic-set",
            data: JSON.parse(output.trim())
        };
    }

});


